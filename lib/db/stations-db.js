const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const { ARDENT_STATIONS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) database = new SqlLiteDatabase(ARDENT_STATIONS_DB, options)
  return database
}

function getDatabaseName () {
  path.basename(ARDENT_STATIONS_DB)
}

function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS stations (
      stationName TEXT COLLATE NOCASE,
      marketId INT,
      distanceToArrival REAL,
      stationType TEXT,
      allegiance TEXT,
      government TEXT,
      controllingFactionId INT,
      controllingFactionName TEXT,
      primaryEconomy TEXT,
      secondaryEconomy TEXT,
      shipyard INT,
      outfitting INT,
      blackMarket INT,
      contacts INT,
      crewLounge INT,
      interstellarFactorsContact INT,
      materialTrader INT,
      missions INT,
      refuel INT,
      repair INT,
      restock INT,
      searchAndRescue INT,
      technologyBroker INT,
      tuning INT,
      universalCartographics INT,
      systemAddress INT,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      bodyId INT,
      bodyName TEXT COLLATE NOCASE,
      latitude REAL,
      longitude REAL,
      maxLandingPadSize INT,
      updatedAt TEXT
    )
  `)
}

function ensureIndexes () {
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_stationName_collate ON stations (stationName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_systemName_collate ON stations (systemName COLLATE NOCASE)')
  getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_marketId ON stations (marketId)')
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
