const Package = require('./package.json')
console.log(`Ardent Collector v${Package.version} starting`)

// Initalise default value for env vars before other imports
console.log('Configuring environment …')
const {
  EDDN_SERVER,
  ARDENT_BACKUP_LOG,
  ARDENT_DATABASE_STATS,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL
} = require('./lib/consts')

// In development this can be used to capture real-world payload examples
const SAVE_PAYLOAD_EXAMPLES = false
const PAYLOAD_EXAMPLES_DIR = './tests/payload-examples'

console.log('Loading dependancies …')
const { exec } = require('child_process')
const process = require('process')
const fs = require('fs')
const zmq = require('zeromq')
const zlib = require('zlib')
const cron = require('node-cron')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const koaBodyParser = require('koa-bodyparser')

console.log('Connecting to databases …')
require('./lib/db')

console.log('Loading libraries …')
const commodityEvent = require('./lib/event-handlers/commodity-event')
const discoveryScanEvent = require('./lib/event-handlers/discovery-scan-event')
const navRouteEvent = require('./lib/event-handlers/navroute-event')
const approachSettlementEvent = require('./lib/event-handlers/approach-settlement-event')
const journalEvent = require('./lib/event-handlers/journal-event')

// When this is set don't write events to the database
let databaseWriteLocked = false
function enableDatabaseWriteLock () { databaseWriteLocked = true }
function disableDatabaseWriteLock () { databaseWriteLocked = false }

// Ensure payload example dir (and journal examples sub dir) exists
if (SAVE_PAYLOAD_EXAMPLES === true &&
    !fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1`)) {
  fs.mkdirSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1`, { recursive: true })
}

;(async () => {
  // Start web service
  console.log('Starting web service')
  const app = new Koa()
  const router = new KoaRouter()
  app.use(koaBodyParser())

  // Set default cache headers
  app.use((ctx, next) => {
    ctx.set('Cache-Control', ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL)
    ctx.set('Ardent-Collector-Version', `${Package.version}`)
    return next()
  })

  router.get('/', (ctx) => { ctx.body = printStats() })
  app.use(router.routes())

  app.listen(ARDENT_COLLECTOR_LOCAL_PORT)
  console.log('Web service online')

  console.log(`Connecting to EDDN ${EDDN_SERVER}…`)
  const socket = new zmq.Subscriber()
  socket.connect(EDDN_SERVER)
  socket.subscribe('')
  console.log('Connected to EDDN')

  // If a backup log does not exist, begin a backup immediately
  if (!fs.existsSync(ARDENT_BACKUP_LOG)) {
    console.log('No backup log found, starting backup now')
    enableDatabaseWriteLock()
    exec('npm run backup', (error, stdout, stderr) => {
      if (error) console.error(error)
      disableDatabaseWriteLock()
    })
  } else {
    console.log('Found existing backup log')
  }

  // Run a task every day to do database maintenance and backups at 07:15 UTC.
  //
  // Both optimization and backup block writing to the database so ideally
  // requests should be buffered during that time, but it's a short window
  // of 5-6 minutes every day and it happens during a quiet period so it's not
  // been a priority to handle a few missing updates.
  //
  // During the maintenance window the API and website continue running.
  //
  // As long as the server is fast enough and the number of writes is low enough
  // if we don't explicitly block writing all tasks will still complete, but it
  // will cause timeouts and errors (and may take longer for the tasks to
  // complete) so is better to explicitly pause writing for a few minutes.
  //
  // Optimization takes around 1 minute in production and blocks writes.
  cron.schedule('0 15 7 * * *', () => {
    enableDatabaseWriteLock() // Disable writing to database during maintenance

    // With SQLite only connections opened after optimization take advantage of
    // any optimizations, so at 7:55 UTC every day all services that connect
    // to the database – i.e. the Collector and the API – are automatically
    // restarted (this is effectively instant).
    exec('npm run optimize', (error, stdout, stderr) => {
      if (error) console.error(error)

      // Backup takes around 5 minutes in production and blocks writes.
      exec('npm run backup', (error, stdout, stderr) => {
        if (error) console.error(error)

        disableDatabaseWriteLock() // Mark database as open for writing again

        // Generating stats and trade reports takes about 10 minutes. It does not
        // block anything but the queries are quite heavy as they involve
        // scanning and performing analysis on the entire trading database so we
        // only do it once a day.
        exec('npm run stats:commodity', (error, stdout, stderr) => {
          if (error) console.error(error)
        })

        // Generate compressed versions of the backups (suitable for download)
        // in the background. This uses gzip on the newly created backup files.
        // It can take around 15 minutes but does not impact the live database.
        // Downloads of backups during the maintaince window may fail when the
        // backup images are updated. 
        exec('npm run backup:compress', (error, stdout, stderr) => {
          if (error) console.error(error)
        })
      })
    })
  })

  // Generate high level stats like total star systems, trade orders, etc.
  // Takes about 20s to run in test but 1m 30s in production due to load.
  // @TODO Could maybe be real time if replaced with triggers on tables,
  // or a best-effort internal counter that tracks changes between updates.
  cron.schedule('0 0 * * * *', () => {
    exec('npm run stats:database', (error, stdout, stderr) => {
      if (error) console.error(error)
    })
  })

  console.log(printStats())
  console.log('Ardent Collector ready!')

  for await (const [message] of socket) {
    if (databaseWriteLocked === true) {
      // TODO Buffer messages in a queue to disk and process them later
      await new Promise(setImmediate)
      continue
    }

    zlib.inflate(message, (error, chunk) => {
      if (error) return console.error(error)

      const payload = JSON.parse(chunk.toString('utf8'))
      const schema = payload?.$schemaRef ?? 'SCHEMA_UNDEFINED'

      // If we don't have an example message and SAVE_PAYLOAD_EXAMPLES is true, save it
      if (SAVE_PAYLOAD_EXAMPLES) {
        if (schema === 'https://eddn.edcd.io/schemas/journal/1') {
          // Journal entries are a special case (they represent different game events and are raw evnets, not synthetic)
          if (!fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1/${payload.message.event.toLowerCase()}.json`)) {
            fs.writeFileSync(`${PAYLOAD_EXAMPLES_DIR}/journal_1/${payload.message.event.toLowerCase()}.json`, JSON.stringify(payload, null, 2))
          }
        } else {
          const schemaFileName = schema.replace('https://eddn.edcd.io/schemas/', '').replaceAll('/', '_')
          if (!fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`)) { fs.writeFileSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`, JSON.stringify(payload, null, 2)) }
        }
      }
      switch (schema) {
        case 'https://eddn.edcd.io/schemas/commodity/3':
          commodityEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/fssdiscoveryscan/1':
          discoveryScanEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/navroute/1':
          navRouteEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/approachsettlement/1':
          approachSettlementEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/journal/1':
          journalEvent(payload)
          break
        default:
      }
    })
    await new Promise(setImmediate)
  }
})()

process.on('exit', () => console.log('Shutting down'))

process.on('uncaughtException', (e) => console.log('Uncaught exception:', e))

function printStats () {
  const stats = JSON.parse(fs.readFileSync(ARDENT_DATABASE_STATS))

  try {
    return `Ardent Collector v${Package.version} Online\n` +
      '--------------------------\n' +
      ((stats)
        ? 'Locations:\n' +
          `* Star systems: ${stats.systems.toLocaleString()}\n` +
          `* Points of interest: ${stats.pointsOfInterest.toLocaleString()}\n` +
          'Stations:\n' +
          `* Stations: ${stats.stations.stations.toLocaleString()}\n` +
          `* Fleet Carriers: ${stats.stations.carriers.toLocaleString()}\n` +
          `* Station updates in last hour: ${stats.stations.updatedInLastHour.toLocaleString()}\n` +
          `* Station updates in last 24 hours: ${stats.stations.updatedInLast24Hours.toLocaleString()}\n` +
          `* Station updates in last 7 days: ${stats.stations.updatedInLast7Days.toLocaleString()}\n` +
          `* Station updates in last 30 days: ${stats.stations.updatedInLast30Days.toLocaleString()}\n` +
          'Trade:\n' +
          `* Station markets: ${stats.trade.stations.toLocaleString()}\n` +
          `* Fleet Carrier markets: ${stats.trade.carriers.toLocaleString()}\n` +
          `* Trade systems: ${stats.trade.systems.toLocaleString()}\n` +
          `* Trade orders: ${stats.trade.tradeOrders.toLocaleString()}\n` +
          `* Trade updates in last hour: ${stats.trade.updatedInLastHour.toLocaleString()}\n` +
          `* Trade updates in last 24 hours: ${stats.trade.updatedInLast24Hours.toLocaleString()}\n` +
          `* Trade updates in last 7 days: ${stats.trade.updatedInLast7Days.toLocaleString()}\n` +
          `* Trade updates in last 30 days: ${stats.trade.updatedInLast30Days.toLocaleString()}\n` +
          `* Unique commodities: ${stats.trade.uniqueCommodities.toLocaleString()}\n` +
          `Stats last updated: ${stats.timestamp}`
        : 'Stats not generated yet')
  } catch (e) {
    return 'Error: Could not load stats'
  }
}
