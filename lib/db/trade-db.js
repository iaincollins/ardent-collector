const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const { ARDENT_TRADE_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) database = new SqlLiteDatabase(ARDENT_TRADE_DB, options)
  return database
}

function getDatabaseName () {
  return path.basename(ARDENT_TRADE_DB)
}

function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS commodities (
      commodityId TEXT PRIMARY KEY,
      commodityName TEXT COLLATE NOCASE,
      marketId INT,
      stationName TEXT COLLATE NOCASE,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      fleetCarrier INT,
      buyPrice INT,
      demand INT,
      demandBracket INT,
      meanPrice INT,
      sellPrice INT,
      stock INT,
      stockBracket INT,
      statusFlags TEXT,
      updatedAt TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_collate ON commodities (commodityName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_stationName_collate ON commodities (stationName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_systemName_collate ON commodities (systemName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_fleetCarrier ON commodities (fleetCarrier)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_buyPrice ON commodities (buyPrice)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_sellPrice ON commodities (sellPrice)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_demand ON commodities (demand)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_stock ON commodities (stock)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_marketId ON commodities (marketId)')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
