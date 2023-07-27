const SystemsDatabase = require('./systems-db')
const LocationsDatabase = require('./locations-db')
const StationsDatabase = require('./stations-db')
const TradeDatabase = require('./trade-db')

const [
  systemsDb,
  locationsDb,
  stationsDb,
  tradeDb
] = [
  SystemsDatabase,
  LocationsDatabase,
  StationsDatabase,
  TradeDatabase
].map(database => {
  const databaseName = database.getDatabaseName()

  console.log(`[${databaseName}] Initalizing database`)
  const db = database.getDatabase({
    // verbose: console.log
  })

  // Set default DB journal mode and truncate at startup
  console.log(`[${databaseName}] Enabling Write Ahead Log`)
  db.pragma('journal_mode = WAL')

  console.log(`[${databaseName}] Ensuring tables exist and indexes present`)
  database.ensureTables()
  database.ensureIndexes()

  console.log(`[${databaseName}] Database initalized`)
  return db
})

module.exports = {
  systemsDb,
  locationsDb,
  stationsDb,
  tradeDb
}
