const path = require('path')
const fs = require('fs')

// Valid config file locations
const ARDENT_CONFIG_LOCATIONS = [
  '/etc/ardent.config',
  path.join(__dirname, '../../ardent.config'),
  path.join(__dirname, '../ardent.config')
]

for (const path of ARDENT_CONFIG_LOCATIONS.reverse()) {
  if (fs.existsSync(path)) require('dotenv').config({ path })
}

const EDDN_SERVER = process.env?.EDDN_SERVER ?? 'tcp://eddn.edcd.io:9500'

const ARDENT_COLLECTOR_LOCAL_PORT = process.env?.ARDENT_COLLECTOR_LOCAL_PORT ?? 3002
const ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL = `public, max-age=${60 * 15}, stale-while-revalidate=${60 * 60}, stale-if-error${60 * 60}`
const ARDENT_DATA_DIR = process.env?.ARDENT_DATA_DIR ?? path.join(__dirname, '../../ardent-data')
const ARDENT_CACHE_DIR = process.env?.ARDENT_CACHE_DIR ?? path.join(ARDENT_DATA_DIR, 'cache')
const ARDENT_BACKUP_DIR = process.env?.ARDENT_BACKUP_DIR ?? path.join(__dirname, '../../ardent-backup')
const ARDENT_BACKUP_LOG = path.join(ARDENT_BACKUP_DIR, './backup.log')
const ARDENT_DATABASE_STATS = path.join(ARDENT_CACHE_DIR, 'database-stats.json')

const ARDENT_SYSTEMS_DB = path.join(ARDENT_DATA_DIR, '/systems.db')
const ARDENT_LOCATIONS_DB = path.join(ARDENT_DATA_DIR, '/locations.db')
const ARDENT_STATIONS_DB = path.join(ARDENT_DATA_DIR, '/stations.db')
const ARDENT_TRADE_DB = path.join(ARDENT_DATA_DIR, '/trade.db')

// Data in the Systems DB assumes these values and needs rebuilding if changes
const SYSTEM_GRID_SIZE = 100 // In light years
const SYSTEM_SECTOR_HASH_LENGTH = 8 // Enough to minimise sector ID collisions

module.exports = {
  EDDN_SERVER,
  ARDENT_COLLECTOR_LOCAL_PORT,
  ARDENT_COLLECTOR_DEFAULT_CACHE_CONTROL,
  ARDENT_DATA_DIR,
  ARDENT_CACHE_DIR,
  ARDENT_BACKUP_DIR,
  ARDENT_BACKUP_LOG,
  ARDENT_DATABASE_STATS,
  ARDENT_SYSTEMS_DB,
  ARDENT_LOCATIONS_DB,
  ARDENT_STATIONS_DB,
  ARDENT_TRADE_DB,
  SYSTEM_GRID_SIZE,
  SYSTEM_SECTOR_HASH_LENGTH
}
