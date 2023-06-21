const Package = require('./package.json')
console.log(`Ardent Collector v${Package.version} starting`)

// Initalise default value for env vars before other imports
console.log('Configuring environment …')
const {
  EDDN_SERVER,
  ARDENT_BACKUP_LOG,
  ARDENT_DATA_DIR,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL
} = require('./lib/consts')

// In development this can be used to capture real-world payload examples
const SAVE_PAYLOAD_EXAMPLES = false
const PAYLOAD_EXAMPLES_DIR = './tests/payload-examples'

console.log('Loading dependancies …')
const { exec } = require('child_process')
const process = require('process')
const path = require('path')
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

// When this is set don't write events to the database (should be buffered)
let databaseWriteLocked = false

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

  // If a backup log does not exist, being a backup immediately
  if (!fs.existsSync(ARDENT_BACKUP_LOG)) {
    console.log('No backup log found, starting backup now')
    databaseWriteLocked = true
    exec('npm run backup', (error, stdout, stderr) => {
      if (error) console.error(error)
      databaseWriteLocked = false
    })
  } else {
    console.log('Found existing backup log')
  }

  // Run a task every day to export data to a network volume at 07:15 UTC.
  // This is done ahead of disk volume backups and report generation.
  //
  // This task takes about 15 minutes to run. Currently no attempt to buffer new
  // data is made during the backup, but that may change in future.
  cron.schedule('0 15 7 * * *', () => {
    databaseWriteLocked = true
    // While database is going to be locked for backup, also run an optimize
    // routine as it too blocks writing (even when run from a seperate thread).
    exec('npm run optimize', (error, stdout, stderr) => {
      if (error) console.error(error)

      exec('npm run backup', (error, stdout, stderr) => {
        if (error) console.error(error)

        // Mark database as open for writing again
        databaseWriteLocked = false

        // After optimizing and performing a backup, generate daily reports.
        // The write lock can be lifted but the the service may be slower while
        // reports are being generated (although they explicitly )
        exec('npm run commodity-stats', (error, stdout, stderr) => {
          if (error) console.error(error)
        })
      })
    })
  })

  // Generate stats and reports every hour
  // @TODO Replace hourly stats job with triggers on tables
  cron.schedule('0 0 */1 * * *', () => {
    exec('npm run database-stats', (error, stdout, stderr) => {
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
        const schemaFileName = schema.replace('https://eddn.edcd.io/schemas/', '').replaceAll('/', '_')
        if (!fs.existsSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`)) { fs.writeFileSync(`${PAYLOAD_EXAMPLES_DIR}/${schemaFileName}.json`, JSON.stringify(payload, null, 2)) }
      }
      switch (schema) {
        case 'https://eddn.edcd.io/schemas/commodity/3':
          commodityEvent(payload)
          break
        case 'https://eddn.edcd.io/schemas/fssdiscoveryscan/1':
          discoveryScanEvent(payload)
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
  const stats = JSON.parse(fs.readFileSync(path.join(ARDENT_DATA_DIR, 'stats.json')))

  return `Ardent Collector v${Package.version} Online\n` +
    '--------------------------\n' +
    ((stats)
      ? `Star systems: ${stats.systems.toLocaleString()}\n` +
        `Trade systems: ${stats.trade.systems.toLocaleString()}\n` +
        `Trade stations: ${stats.trade.stations.toLocaleString()}\n` +
        `Trade carriers: ${stats.trade.fleetCarriers.toLocaleString()}\n` +
        `Trade orders: ${stats.trade.tradeOrders.toLocaleString()}\n` +
        `Trade updates in last 24 hours: ${stats.trade.updatedInLast24Hours.toLocaleString()}\n` +
        `Trade updates in last 7 days: ${stats.trade.updatedInLast7Days.toLocaleString()}\n` +
        `Trade updates in last 30 days: ${stats.trade.updatedInLast30Days.toLocaleString()}\n` +
        `Unique commodities: ${stats.trade.uniqueCommodities.toLocaleString()}\n` +
        `Stats last updated: ${stats.timestamp} (updated hourly)`
      : 'Stats not generated yet')
}
