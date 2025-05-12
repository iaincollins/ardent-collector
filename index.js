const Package = require('./package.json')
console.log(`Ardent Collector v${Package.version} starting`)
console.log(new Date().toISOString())

// Initalise default value for env vars before other imports
console.log('Configuring environment …')
const {
  EDDN_SERVER,
  ARDENT_BACKUP_LOG,
  ARDENT_DATABASE_STATS,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL,
  ARDENT_TRADE_DB,
  ARDENT_STATIONS_DB,
  ARDENT_LOCATIONS_DB,
  MAINTENANCE_DAY_OF_WEEK,
  MAINTENANCE_WINDOW_START_HOUR,
  MAINTENANCE_WINDOW_END_HOUR
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
const startupMaintenance = require('./scripts/startup-maintenance')
const commodityEvent = require('./lib/event-handlers/commodity-event')
const discoveryScanEvent = require('./lib/event-handlers/discovery-scan-event')
const navRouteEvent = require('./lib/event-handlers/navroute-event')
const approachSettlementEvent = require('./lib/event-handlers/approach-settlement-event')
const journalEvent = require('./lib/event-handlers/journal-event')
const { closeAllDatabaseConnections } = require('./lib/db')

// When this is set don't write events to the database
let databaseWriteLocked = false
function enableDatabaseWriteLock () { databaseWriteLocked = true }
function disableDatabaseWriteLock () { databaseWriteLocked = false }

// A best effort approach try and keep seelct database files cached in RAM if 
// running on a Linux system that has vmtouch (i.e. like the production server).
//
// This is done to improve read performance in the API, but it is handled by
// the Collector so it can be controlled to allow memory to be freed up during 
// operations like maintenance windows.
//
// The hard disk is an NVMe drive and is reasonably performant and consistent 
// so this works reliably, but reading when cached in RAM is still much faster.
//
// Unlike a ramdisk or a strictly in memory database performance is not assured
// but the trade off is flexibility to grown the database in size and ease of 
// system management.
let databaseCacheTriggerInterval = null
let databaseCacheTriggersetTimeout = null
const cacheTriggerFrequencyInSeconds = 0 // Disabled for now, only runs at startup
function enableDatabaseCacheTrigger () { 
  // Run once immediately, can take up to 90 seconds to complete.
  // Subsequent runs typically take < 5 seconds.
  databaseCacheTrigger()
  if (cacheTriggerFrequencyInSeconds > 0) {
    databaseCacheTriggersetTimeout = setTimeout(() => {
      databaseCacheTriggerInterval = setInterval(databaseCacheTrigger, 1000 * cacheTriggerFrequencyInSeconds)
    }, 1000 * 60 * 2) // Wait 2 minutes after first run to start
  }
}
function disableDatabaseCacheTrigger () {
  clearTimeout(databaseCacheTriggersetTimeout)
  clearInterval(databaseCacheTriggerInterval)
}
function databaseCacheTrigger() {
  const cmd = '/usr/bin/vmtouch'
  if (fs.existsSync(cmd)) {
    exec(`${cmd} -t ${ARDENT_TRADE_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cach trigger for Trade DB:', err, stdout, stderr)
    })
    exec(`${cmd} -t ${ARDENT_STATIONS_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cach trigger for Station DB:', err, stdout, stderr)
    })
    exec(`${cmd} -t ${ARDENT_LOCATIONS_DB}*`, (err, stdout, stderr) => {
      if (err) console.error('Error on cach trigger for Locations DB:', err, stdout, stderr)
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

  await startupMaintenance()

  // If a backup log does not exist, create a new backup immediately
  if (!fs.existsSync(ARDENT_BACKUP_LOG)) {
    console.log('No backup log found, creating backup now')
    enableDatabaseWriteLock()
    
    exec('npm run backup', (error, stdout, stderr) => {
      if (error) console.error(error)
      disableDatabaseWriteLock()
    })
  } else {
    console.log('Confirmed existing backup log found')
  }

  // ABOUT THE MAINTENANCE WINDOW
  //
  // The maintenance window is aligned with the window for the game, which is 
  // usually 7AM UTC on a Thursday.
  //
  // During the maintenance window the API and website continue running and 
  // performance of them should not be impacted.
  //
  // Ardent maintenance tasks - like optimising the databases and creating 
  // backups - takes around 15-30 minutes. The actual game maintenance window 
  // usually is from 7AM to 9AM UTC and commonly takes 2-3 hours, so we these 
  // tasks should all be finished long before the game comes back online.
  //
  // The API and Collector are restarted at 9 AM daily - see below for why.
  //
  // WHY PROCESS ARE RESTARTED
  //
  // With SQLite, only connections opened after optimization take advantage of 
  // optimization runs so services that connect to the database - the Collector 
  // and the API - are automatically restarted by the `pm2` process manager. 
  // The website does not connect to the database directly and so does not need 
  // to be restarted.
  //
  // While our maintenance window starts at 7 AM and blocking tasks are usually 
  // complete within 15-30 minutes, we wait until 9 AM to restart processes.
  //
  // WHY WRITING TO THE DATABASE IS SUSPENDED DURING THE MAINTENANCE WINDOW
  //
  // Both optimization and backup tasks impact writing to the database. Ideally 
  // requests could be buffered during that time, but if the game is offline 
  // then we don't need to worry about lost messages.
  //
  // As long as the server is fast enough and the number of writes is low if we 
  // didn't explicitly block writing queries we could do this at any time, but 
  // in practice it causes timeouts and errors and it will take longer for the 
  // tasks to complete, so in practice a maintenance window works out well, 
  // especially given the the game itself has one and so is offline anyway.
  cron.schedule(`0 0 ${MAINTENANCE_WINDOW_START_HOUR} * * ${MAINTENANCE_DAY_OF_WEEK}`, () => {
    enableDatabaseWriteLock() // Disable writing to database during maintenance
    disableDatabaseCacheTrigger() // Disable cache trigger during maintenance

    exec('npm run optimize', (error, stdout, stderr) => {
      if (error) console.error(error)

      // The backup takes around 15 minutes to complete, with most of that 
      // being down to the systems database (around 150 million entires). This 
      // could be optimised but there isn't really a need to.
      exec('npm run backup', (error, stdout, stderr) => {
        if (error) console.error(error)

        disableDatabaseWriteLock() // Mark database as open for writing again
        enableDatabaseCacheTrigger() // Re-enable database cache trigger after backup

        // Commpress generated backups to make them avalible for download in the 
        // background. This has fairly low CPU impact but can take a while.
        exec('npm run backup:compress', (error, stdout, stderr) => {
          if (error) console.error(error)
        })
      })
    })
  })

  cron.schedule(`0 15 ${MAINTENANCE_WINDOW_END_HOUR} * * ${MAINTENANCE_DAY_OF_WEEK}`, () => {
    // Low priority task run after the maintenance window is complete...

    // Generating stats does not block anything but can be slow and the queries
    // are quite heavy as they involve scanning and performing analysis on the
    // entire trading database so it's best done infrequently and ideally soon 
    // after an optimiztion pass.
    exec('npm run stats:commodity', (error, stdout, stderr) => {
      if (error) console.error(error)
    })
  })

  // Generate daily stats like total star systems, number of trade orders, etc.
  //
  // FIXME: This has been refactored but is still a bit slow and could be better
  // if the collector just logged stats as messags came in and periodically
  // logged them to disk, in a JSON file or database.
  //
  // TODO Moving this to 6 AM temporarily. Intend to replace this with 
  // an implementation that leverages sqlite3-rsync to do a local copy and
  // perform more frequent stats runs against those databases to avoid
  // impacting production performance.
  cron.schedule('0 0 6 * * *', () => {
    exec('npm run stats:database', (error, stdout, stderr) => {
      if (error) console.error(error)
    })
  })

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

      // Ignore messages that are not from the live version of the game
      // i.e. At least version 4.0.0.0 -or- the version starts with 'CAPI-Live-'
      // which indicates the data has come from the live API provided by FDev.
      // This will mean we ignore some mesasges from software that is not 
      // behaving correctly but we can't trust data from old software anyway as
      // it might be from someone running a legacy version of the game.
      var gameMajorVersion = Number(payload?.header?.gameversion?.split('.')?.[0] ?? 0)
      if (gameMajorVersion < 4 && !payload?.header?.gameversion?.startsWith('CAPI-Live-'))
      return

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

process.on('SIGTERM', () => {
  console.log('Ardent Collector received SIGTERM signal')
  closeAllDatabaseConnections()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('Ardent Collector received SIGINT signal')
  closeAllDatabaseConnections()
  process.exit(0)
})

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
