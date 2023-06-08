// stockBracket & demandBracket:
// Values can be:
// 0 || '': None
// 1: Low
// 2: Medium
// 3: High

function ensureCommoditiesTableExists (db) {
  db.exec(`
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

function ensureCommoditiesTableIndexesExists (db) {
  db.exec('CREATE INDEX IF NOT EXISTS commodities_commodityName_collate ON commodities (commodityName COLLATE NOCASE)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_stationName_collate ON commodities (stationName COLLATE NOCASE)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_systemName_collate ON commodities (systemName COLLATE NOCASE)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_fleetCarrier ON commodities (fleetCarrier)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_buyPrice ON commodities (buyPrice)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_sellPrice ON commodities (sellPrice)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_demand ON commodities (demand)')
  db.exec('CREATE INDEX IF NOT EXISTS commodities_stock ON commodities (stock)')
}

module.exports = (db) => {
  ensureCommoditiesTableExists(db)
  ensureCommoditiesTableIndexesExists(db)
}
