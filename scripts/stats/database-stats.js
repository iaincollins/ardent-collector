const fs = require('fs')
const { ARDENT_CACHE_DIR, ARDENT_DATABASE_STATS } = require('../../lib/consts')
const { getISOTimestamp } = require('../../lib/utils/dates')
const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../../lib/db')

// TODO This needs a complete rewrite, it's both slow and not very precise 
// Any changes should be synced with the front end
;(async () => {
  console.log('Updating database stats…')
  console.time('Update database stats')
  const commodityStats = tradeDb.prepare(`
    SELECT
      COUNT(*) AS tradeOrders,
      (SELECT COUNT(DISTINCT(commodityName)) as count FROM commodities) AS uniqueCommodities,
      (SELECT COUNT(DISTINCT(systemName)) as count FROM commodities) AS tradeSystems,
      (SELECT COUNT(DISTINCT(stationName)) as count FROM commodities WHERE fleetCarrier = 0) AS tradeStations,
      (SELECT COUNT(DISTINCT(stationName)) as count FROM commodities WHERE fleetCarrier = 1) AS tradeCarriers,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours
    FROM commodities
    `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })
  const stationStats = stationsDb.prepare(`
  SELECT
    (SELECT COUNT(*) FROM stations WHERE stationType != 'FleetCarrier') as stations,
    (SELECT COUNT(*) FROM stations WHERE stationType = 'FleetCarrier') as fleetCarriers,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours
  FROM stations
  `).get({
    last24HoursTimestamp: getISOTimestamp(-1)
  })
  const stats = {
    systems: systemsDb.prepare('SELECT COUNT(*) as count FROM systems').get().count,
    pointsOfInterest: locationsDb.prepare('SELECT COUNT(*) as count FROM locations').get().count,
    stations: {
      stations: stationStats.stations,
      carriers: stationStats.fleetCarriers,
      updatedInLast24Hours: stationStats.updatedInLast24Hours
    },
    trade: {
      systems: commodityStats.tradeSystems,
      stations: commodityStats.tradeStations,
      carriers: commodityStats.tradeCarriers,
      tradeOrders: commodityStats.tradeOrders,
      updatedInLast24Hours: commodityStats.updatedInLast24Hours,
      uniqueCommodities: commodityStats.uniqueCommodities
    },
    updatedInLast24Hours: commodityStats.updatedInLast24Hours + stationStats.updatedInLast24Hours,
    timestamp: new Date().toISOString()
  }
  if (!fs.existsSync(ARDENT_CACHE_DIR)) { fs.mkdirSync(ARDENT_CACHE_DIR, { recursive: true }) }
  fs.writeFileSync(ARDENT_DATABASE_STATS, JSON.stringify(stats, null, 2))
  console.timeEnd('Update database stats')
  process.exit()
})()
