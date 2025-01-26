const Package = require('./package.json')
console.log(`Ardent Collector v${Package.version} starting`)

// Initalise default value for env vars before other imports
console.log('Configuring environment …')
const {
  EDDN_SERVER,
  ARDENT_BACKUP_LOG,
  ARDENT_DATABASE_STATS,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL,
  ARDENT_TRADE_DB
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

// Take a best effort approach try and keep trade database files cached in RAM  
// if running on a Linux system that has vmtouch (like the production server).
//
// This is done to improve READ performance in the API, but it is handled by
// the Collector so it can be controlled to allow memory to be freed up during 
// operations like maintenance windows.
//
// The hard disk is an NVMe drive and is reasonably performant and consistent 
// so this works reliably, but reading from RAM is still MUCH faster.
//
// Other databases like the Station database and even the much larger Systems 
// database work fine without being in memory, the trade database is a special
// l case, due to the nature of the data and the many ways it can be queried.
//
// Note: This does not vmtouch in daemon mode due to implications of that, but
// instead uses vmtouch interactively which results in the benifits of RAM disk 
// performance most of the time, without the complexity of dealing with syncing
// data to backed up source, because the OS will handle that automatically.
//
// Using a RAM disk in a RAID-1 array with a physical partition configured with 
// write behind is arguably a better solution - but is more work and, given the
// RAM limitations of the server, would result in a hard failure if the
// database was to grow large to fit in memory.
let databaseCacheTriggerInterval = null
let databaseCacheTriggersetTimeout = null
function enableDatabaseCacheTrigger () { 
  // Run once immediately - which can take up to 90 seconds - then every minute.
  //
  // Subsequent runs typically take < 5 seconds. It doesn't seem to cause a 
  // problem in practice to have runs overlap but this tries to avoid it anyway.
  databaseCacheTrigger()
  databaseCacheTriggersetTimeout = setTimeout(() => {
    databaseCacheTriggerInterval = setInterval(databaseCacheTrigger, 1000 * 60 * 1) // Schedule trigger to run every minute
  }, 1000 * 60 * 2) // Wait 2 minutes after first run to start running every minute
}
function disableDatabaseCacheTrigger () {
  clearTimeout(databaseCacheTriggersetTimeout)
  clearInterval(databaseCacheTriggerInterval)
}
function databaseCacheTrigger() {
  const cmd = '/usr/bin/vmtouch'
  if (fs.existsSync(cmd)) {
    exec(`${cmd} -t ${ARDENT_TRADE_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('databaseCacheTrigger:', err, stdout, stderr)
    })
  }
}

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

  // If a backup log does not exist, create a new backup immediately
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

  // The maintenance window is offically from 06:00 to 08:00 BST every day.
  //
  // During the maintenance window the API and website continue running and
  // performance of them should not be impacted.
  //
  // THE SCHEDULE:
  //
  // 1. Start of maintenance window at 06:00 BST.
  // 2. Database optimization and backup tasks are started at 06:15 BST.
  // 3. Optimization takes around 1-2 minutes and the backup job takes
  //    around 10-15 minutes - we pause ingesting from EDDN until both
  //    those tasks are complete (around 15 minutes in total).
  // 4. The Ardent Collector service resumes processing updates and some
  //    daily trade reports are generated (e.g. lists of best buy/sell 
  //    prices for different commodities in different regions).
  // 5. Archiving/compressing of backups then starts in the background.
  //    The entire archiving process takes around 30 minutes.
  //    The downloadable daily backups are updated as so as the new data
  //    is ready, attempting to download backups during the maintenance
  //    window is not recommended.
  // 6. At 07:15 BST the Ardent API service is restarted (see notes below).
  // 7. At 07:45 BST the Ardent Collector - this service - is restarted.
  // 8. End of maintenance window at 08:00 BST.
  //
  // NOTES:
  //
  // WHY PROCESS ARE RESTARTED:
  //
  // With SQLite only connections opened after optimization take advantage
  // of optimization runs so services that connect to the database - the 
  // Collector and the API - are automatically restarted by the `pm2`
  // process manager. The website does not talk to the database directly
  // and does not need to be restarted.
  //
  // WHY WRITING TO THE DATABASE IS PAUSED:
  //
  // Both optimization and backup tasks block writing to the database and ideally
  // requests would be buffered during that time, but it's a short window
  // of a few minutes in the morning every day and it happens during a quiet
  // period so it's not been a priority to implement dead letter queuing.
  //
  // As long as the server is fast enough and the number of writes is low enough
  // if we don't explicitly block writing queries can still complete, but it may
  // cause timeouts and errors and it will take longer for the tasks to complete
  // so we explicitly pause any attempt to write to the db for a few minutes.
  //
  // Optimization takes around 1-2 minutes.
  cron.schedule('0 15 6 * * *', () => {
    enableDatabaseWriteLock() // Disable writing to database during maintenance
    disableDatabaseCacheTrigger() // Disable cache trigger during maintenance

    exec('npm run optimize', (error, stdout, stderr) => {
      if (error) console.error(error)

      // Backup takes around 15 minutes in production
      exec('npm run backup', (error, stdout, stderr) => {
        if (error) console.error(error)

        disableDatabaseWriteLock() // Mark database as open for writing again
        enableDatabaseCacheTrigger() // Re-enable database cache trigger after backup

        // Generating stats and trade reports takes about 10 minutes. It does not
        // block anything but the queries are quite heavy as they involve
        // scanning and performing analysis on the entire trading database so we
        // only do it once a day.
        exec('npm run stats:commodity', (error, stdout, stderr) => {
          if (error) console.error(error)
        })

        // Generate compressed versions of the backups (suitable for download)
        // in the background. This uses gzip on the newly created backup files.
        // It can take around 30 minutes but does not impact the live database.
        // Downloads of backups during the maintaince window may fail when the
        // backup images are updated. 
        exec('npm run backup:compress', (error, stdout, stderr) => {
          if (error) console.error(error)
        })
      })
    })
  })

  // Generate high level stats like total star systems, trade orders, etc.
  // Takes about 20s to run in test but 1m 30s in production due to load,
  // this is a read only task (it writes to a JSON file) and is configured
  // to run every hour on the hour.
  // @TODO Could maybe be real time if replaced with triggers on tables,
  // or a best-effort internal counter that tracks changes between updates.
  //
  // FIXME: This is now taking > 10 minutes to run and driving up CPU usage
  // to 30-50% on all cores when it runs, and causing the commodities database 
  // to be swapped out of disk space entirely, causing the site to stop
  // responding.
  //
  // This should be removed in favour of tracking stats using a real time
  // counter merged with data from the last backup.
  // cron.schedule('0 0 * * * *', () => {
  //   exec('npm run stats:database', (error, stdout, stderr) => {
  //     if (error) console.error(error)
  //   })
  // })

  enableDatabaseCacheTrigger() // Enable cache trigger

  console.log(printStats())
  console.log('Ardent Collector ready!')

  for await (const [message] of socket) {
    if (databaseWriteLocked === true) {
      // TODO Buffer messages in a dead letter queue and process them later
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
          `* Station updates in last 24 hours: ${stats.stations.updatedInLast24Hours.toLocaleString()}\n` +
          'Trade:\n' +
          `* Station markets: ${stats.trade.stations.toLocaleString()}\n` +
          `* Fleet Carrier markets: ${stats.trade.carriers.toLocaleString()}\n` +
          `* Trade systems: ${stats.trade.systems.toLocaleString()}\n` +
          `* Trade orders: ${stats.trade.tradeOrders.toLocaleString()}\n` +
          `* Trade updates in last 24 hours: ${stats.trade.updatedInLast24Hours.toLocaleString()}\n` +
          `* Unique commodities: ${stats.trade.uniqueCommodities.toLocaleString()}\n` +
          `Stats last updated: ${stats.timestamp}`
        : 'Stats not generated yet')
  } catch (e) {
    return 'Error: Could not load stats'
  }
}
