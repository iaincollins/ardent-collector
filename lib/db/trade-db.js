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
      updatedAt TEXT,
      updatedAtDay TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_collate ON commodities (commodityName COLLATE NOCASE)')

  // Having a compound index for name and day seems to improve query times noticeably on slower hardware
  // Note: Commodity names have been normalized during ingestion so it's ok to be case sensitive
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_updatedAtDay ON commodities (commodityName, updatedAtDay)')

  // Case sensitive on system name and station name can still be useful for supporting searches
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_stationName_collate ON commodities (stationName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_systemName_collate ON commodities (systemName COLLATE NOCASE)')  

  // Market ID is a useful index to have
  getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_marketId ON commodities (marketId)')

  // Based on testing, these indexes can probably be removed without impacting performance
  // 2024-11-09 Leaving these definitions in just in case I want to roll back, but will delete them if all goes well
  //
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_fleetCarrier ON commodities (fleetCarrier)')
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_buyPrice ON commodities (buyPrice)')
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_sellPrice ON commodities (sellPrice)')
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_demand ON commodities (demand)')
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_stock ON commodities (stock)')
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS commodities_updatedAtDay ON commodities (updatedAtDay)')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_fleetCarrier')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_buyPrice')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_sellPrice')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_demand')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_stock')
  getDatabase().exec('DROP INDEX IF EXISTS commodities_updatedAtDay')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
