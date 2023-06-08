const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')

const { ARDENT_DATA_DIR } = require('../consts')
const initalizeSystemsDb = require('./systems-db')
const initalizeTradeDb = require('./trade-db')

const ARDENT_SYSTEMS_DB = path.join(ARDENT_DATA_DIR, '/systems.db')
const ARDENT_TRADE_DB = path.join(ARDENT_DATA_DIR, '/trade.db')

const tradeDb = initializeDb(ARDENT_TRADE_DB, initalizeTradeDb)
const systemsDb = initializeDb(ARDENT_SYSTEMS_DB, initalizeSystemsDb)

function initializeDb (pathToDb, initDbMethod) {
  const DB_NAME = path.basename(pathToDb)

  console.log(`[${DB_NAME}] Initalizing database`)
  const options = { /* verbose: console.log */ }
  const db = new SqlLiteDatabase(pathToDb, options)

  // Set default DB journal mode and truncate at startup
  console.log(`[${DB_NAME}] Enabling Write Ahead Log`)
  db.pragma('journal_mode = WAL')

  console.log(`[${DB_NAME}] Ensuring tables exist and indexes present`)
  initDbMethod(db)

  console.log(`[${DB_NAME}] Database initalized`)
  return db
}

module.exports = {
  tradeDb,
  systemsDb
}
