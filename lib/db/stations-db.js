const path = require('path')
const SqlLiteDatabase = require('better-sqlite3')
const { ARDENT_STATIONS_DB } = require('../consts')

let database = null

function getDatabase (options = {}) {
  if (!database) database = new SqlLiteDatabase(ARDENT_STATIONS_DB, options)
  return database
}

function getDatabaseName () {
  return path.basename(ARDENT_STATIONS_DB)
}

// TODO Add 'frontlineSolutions'
// TODO Add 'apexInterstellar'
// TODO Add 'vistaGenomics'
// TODO Add 'pioneerSupplies'
// TODO Add 'bartender'
function ensureTables () {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS stations (
      marketId INT PRIMARY KEY,
      stationName TEXT COLLATE NOCASE,
      distanceToArrival REAL,
      stationType TEXT COLLATE NOCASE,
      allegiance TEXT COLLATE NOCASE,
      government TEXT COLLATE NOCASE,
      controllingFaction TEXT COLLATE NOCASE,
      primaryEconomy TEXT,
      secondaryEconomy TEXT,
      shipyard INT,
      outfitting INT,
      blackMarket INT,
      contacts INT,
      crewLounge INT,
      interstellarFactors INT,
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
  // getDatabase().exec('CREATE INDEX IF NOT EXISTS stations_marketId ON stations (marketId)')
  // I think a lack of unique constraint on marketId is causing the duplicate
  // rows bug here as I think there are duplicate entries from some stations.
  // Event approach settlement event includes market id so the ~10 entries
  // with null events can probably be deleted and a UNIQUE NOT NULL constraint
  // imposed.
}

module.exports = {
  getDatabase,
  getDatabaseName,
  ensureTables,
  ensureIndexes
}
