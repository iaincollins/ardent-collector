const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')
const { getISOTimestamp } = require('../lib/utils/dates')
const { TRADE_DATA_MAX_AGE_DAYS } = require('../lib/consts')
// Using 'VACUUM' can be very slow and use up to 2x the disk space when running.
//
// It is superior at optimization than relying on the optimize command, but in
// practice it is slow and can only be used when a database is not otherwise in
// use. It is typically faster (and involves less downtime) to create a new
// backup (which will use VACCUM INTO, which is faster) and then restore from
// that backup, as the backup created in VACCUM INTO will be fully optimized.
const FULL_VACCUM = false

console.time('Optimize locationsDb')
if (FULL_VACCUM === true) locationsDb.exec('VACUUM')
locationsDb.pragma('wal_checkpoint(TRUNCATE)')
locationsDb.pragma('optimize')
locationsDb.pragma('analysis_limit=0')
locationsDb.exec('ANALYZE')
locationsDb.close()
console.timeEnd('Optimize locationsDb')

console.time('Optimize stationsDb')
if (FULL_VACCUM === true) stationsDb.exec('VACUUM')
stationsDb.pragma('wal_checkpoint(TRUNCATE)')
stationsDb.pragma('optimize')
stationsDb.pragma('analysis_limit=0')
stationsDb.exec('ANALYZE')
stationsDb.close()
console.timeEnd('Optimize stationsDb')

console.time('Optimize tradeDb')
// Purge old trade data
// tradeDb.exec(`
//   DELETE FROM commodities WHERE updatedAt <= '${getISOTimestamp(`-${TRADE_DATA_MAX_AGE_DAYS}`)}'
// `)
// Always vacuum the trade database after deleting old data to shrink it's size
// tradeDb.exec('VACUUM')
tradeDb.pragma('wal_checkpoint(TRUNCATE)')
tradeDb.pragma('optimize')
tradeDb.pragma('analysis_limit=0')
tradeDb.exec('ANALYZE')
tradeDb.close()
console.timeEnd('Optimize tradeDb')

console.time('Optimize systemsDb')
if (FULL_VACCUM === true) systemsDb.exec('VACUUM')
systemsDb.pragma('wal_checkpoint(TRUNCATE)')
systemsDb.pragma('optimize')
systemsDb.pragma('analysis_limit=0')
systemsDb.exec('ANALYZE')
systemsDb.close()
console.timeEnd('Optimize systemsDb')

process.exit()
