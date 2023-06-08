function ensureSystemsTableExists (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      systemAddress INT PRIMARY KEY,
      systemName TEXT COLLATE NOCASE,
      systemX REAL,
      systemY REAL,
      systemZ REAL,
      systemSector STRING,
      updatedAt TEXT
    )
  `)
}

function ensureSystemsTableIndexesExists (db) {
  db.exec('CREATE INDEX IF NOT EXISTS systems_systemName_collate ON systems (systemName COLLATE NOCASE)')
  db.exec('CREATE INDEX IF NOT EXISTS systemSector ON systems (systemSector)')
}

module.exports = (db) => {
  ensureSystemsTableExists(db)
  ensureSystemsTableIndexesExists(db)
}
