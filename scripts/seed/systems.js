// @FIXME This script is old and needs to be refactored before it works again
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const crypto = require('crypto')
const SqlLiteDatabase = require('better-sqlite3')
const {
  ARDENT_DATA_DIR,
  SYSTEM_GRID_SIZE,
  SYSTEM_SECTOR_HASH_LENGTH
} = require('../../lib/consts')
const {
  ensureSystemsTableExists,
  ensureSystemsTableIndexesExists
} = require('../../lib/db/systems-db')

// Systems data seed by spansh.co.uk exports
const SYSTEMS_JSON = '../ardent-seed-data/systems.json'

// Setting this to true is very fast (100,000 inserts a second) but ONLY safe
// to do a *new, empty datababase* with nothing else accessing it. If you stop
// the process you will need to delete the database and start again and let
// the import complete. It will corrupt any existing database.
const UNSAFE_FAST_IMPORT = true

// Fastest but will need many GB of RAM. Only works if UNSAFE_FAST_IMPORT also enabled.
const USE_TRANSACTIONS = true

// Import will grind to a halt if this is run without lots of extra ram
const USE_ADDITIONAL_RAM = true

;(async () => {
  let counter = 0

  const systemsDb = new SqlLiteDatabase(path.join(ARDENT_DATA_DIR, '/systems.db'))

  if (UNSAFE_FAST_IMPORT === true) {
    // Using 'synchronous = OFF' is much faster, but the database may end up
    // corrupted if the program crashes or the computer loses power (etc)
    systemsDb.pragma('synchronous = OFF')

    // Only change journal_mode from 'WAL' to 'OFF' when creating a new DB or you
    // may end up with massive journal files. Also gives significantly speed boost.
    systemsDb.pragma('journal_mode = OFF')

    // Only use locking_mode EXCLUSIVE if no other processes need to access the DB
    systemsDb.pragma('locking_mode = EXCLUSIVE')

    if (USE_ADDITIONAL_RAM === true) {
      systemsDb.pragma('cache_size = 1000000')
      systemsDb.pragma('temp_store = MEMORY')
    }
  }

  ensureSystemsTableExists(db)

  const insertOrReplaceSystem = systemsDb.prepare(`
    INSERT OR REPLACE INTO systems (
      systemAddress,
      systemName,
      systemX,
      systemY,
      systemZ,
      systemSector,
      updatedAt
    ) VALUES (
      @systemAddress,
      @systemName,
      @systemX,
      @systemY,
      @systemZ,
      @systemSector,
      @updatedAt
    )
  `)

  setInterval(() => console.log(`${counter.toLocaleString()} entries processed`), 1000 * 10).unref()

  async function sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  const readStream = fs.createReadStream(SYSTEMS_JSON)
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity })

  console.time('Importing systems')

  // Using BEGIN/COMMIT is faster but can use a very large amount of disk space
  // If you end up with a huge -wal file, you can use 'journal_mode = DELETE'
  // to reset it and get the diskspace back (do not just delete the -wal file!)
  if (UNSAFE_FAST_IMPORT === true && USE_TRANSACTIONS === true) systemsDb.prepare('BEGIN').run()
  for await (const line of rl) {
    if (line === '[' || line === ']') continue

    counter++

    // Every 10000 operations, fully pause for a second to manage load
    // (can remove this for extra speed). Disabled if using UNSAFE_FAST_IMPORT
    if (UNSAFE_FAST_IMPORT !== true) { if (counter % 10000 === 0) await sleep(1000) }

    try {
      const system = JSON.parse(line.replace(/,$/, '').trim())

      const systemXGrid = Math.floor(system.coords.x / SYSTEM_GRID_SIZE)
      const systemYGrid = Math.floor(system.coords.y / SYSTEM_GRID_SIZE)
      const systemZGrid = Math.floor(system.coords.z / SYSTEM_GRID_SIZE)
      const systemSector = crypto.createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
        .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
        .digest('hex')

      insertOrReplaceSystem.run({
        systemAddress: system.id64,
        systemName: system.name,
        systemX: system.coords.x,
        systemY: system.coords.y,
        systemZ: system.coords.z,
        systemSector,
        updatedAt: new Date(system.updateTime).toISOString()
      })

      // Allow other process to run
      await new Promise(setImmediate)
    } catch (e) {
      console.error('Failed to parse: ', line, e)
      continue
    }
  }
  if (UNSAFE_FAST_IMPORT === true && USE_TRANSACTIONS === true) systemsDb.prepare('COMMIT').run()

  console.timeEnd('Importing systems')

  console.time('Creating indexes')
  ensureSystemsTableIndexesExists(db)
  console.timeEnd('Creating indexes')

  systemsDb.close()

  console.log('Import complete')
  process.exit()
})()
