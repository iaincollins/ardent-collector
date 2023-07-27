const fs = require('fs')
const { ARDENT_CACHE_DIR, ARDENT_DATABASE_STATS } = require('../../lib/consts')
const { getISOTimestamp } = require('../../lib/utils/dates')
const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../../lib/db')

;(async () => {
  const dateTimeOneHourAgo = new Date(new Date().setHours(new Date().getHours() - 1)).toISOString()

  console.log('Updating database stats…')
  console.time('Update database stats')
  const commodityStats = tradeDb.prepare(`
    SELECT
      COUNT(*) AS tradeOrders,
      (SELECT COUNT(DISTINCT(commodityName)) as count FROM commodities) AS uniqueCommodities,
      (SELECT COUNT(DISTINCT(systemName)) as count FROM commodities) AS tradeSystems,
      (SELECT COUNT(DISTINCT(stationName)) as count FROM commodities WHERE fleetCarrier = 0) AS tradeStations,
      (SELECT COUNT(DISTINCT(stationName)) as count FROM commodities WHERE fleetCarrier = 1) AS tradeCarriers,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @lastHourTimestamp) as updatedInLastHour,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last7DaysTimestamp) as updatedInLast7Days,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last30DaysTimestamp) as updatedInLast30Days,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt > @last90DaysTimestamp) as updatedInLast90Days,
      (SELECT COUNT(*) FROM commodities WHERE updatedAt <= @last90DaysTimestamp) as updatedMoreThan90DaysAgo
    FROM commodities
    `).get({
    lastHourTimestamp: dateTimeOneHourAgo,
    last24HoursTimestamp: getISOTimestamp(-1),
    last7DaysTimestamp: getISOTimestamp(-7),
    last30DaysTimestamp: getISOTimestamp(-30),
    last90DaysTimestamp: getISOTimestamp(-90)
  })
  const stationStats = stationsDb.prepare(`
  SELECT
    (SELECT COUNT(*) FROM stations WHERE stationType != 'Fleet Carrier') as stations,
    (SELECT COUNT(*) FROM stations WHERE stationType = 'Fleet Carrier') as fleetCarriers,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @lastHourTimestamp) as updatedInLastHour,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last24HoursTimestamp) as updatedInLast24Hours,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last7DaysTimestamp) as updatedInLast7Days,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last30DaysTimestamp) as updatedInLast30Days,
    (SELECT COUNT(*) FROM stations WHERE updatedAt > @last90DaysTimestamp) as updatedInLast90Days,
    (SELECT COUNT(*) FROM stations WHERE updatedAt <= @last90DaysTimestamp) as updatedMoreThan90DaysAgo
  FROM stations
  `).get({
    lastHourTimestamp: dateTimeOneHourAgo,
    last24HoursTimestamp: getISOTimestamp(-1),
    last7DaysTimestamp: getISOTimestamp(-7),
    last30DaysTimestamp: getISOTimestamp(-30),
    last90DaysTimestamp: getISOTimestamp(-90)
  })
  const stats = {
    systems: systemsDb.prepare('SELECT COUNT(*) as count FROM systems').get().count,
    pointsOfInterest: locationsDb.prepare('SELECT COUNT(*) as count FROM locations').get().count,
    stations: {
      stations: stationStats.stations,
      carriers: stationStats.fleetCarriers,
      updatedInLastHour: stationStats.updatedInLastHour,
      updatedInLast24Hours: stationStats.updatedInLast24Hours,
      updatedInLast7Days: stationStats.updatedInLast7Days,
      updatedInLast30Days: stationStats.updatedInLast30Days,
      updatedInLast90Days: stationStats.updatedInLast90Days,
      updatedMoreThan90DaysAgo: stationStats.updatedMoreThan90DaysAgo
    },
    trade: {
      systems: commodityStats.tradeSystems,
      stations: commodityStats.tradeStations,
      carriers: commodityStats.tradeCarriers,
      tradeOrders: commodityStats.tradeOrders,
      updatedInLastHour: commodityStats.updatedInLastHour,
      updatedInLast24Hours: commodityStats.updatedInLast24Hours,
      updatedInLast7Days: commodityStats.updatedInLast7Days,
      updatedInLast30Days: commodityStats.updatedInLast30Days,
      updatedInLast90Days: commodityStats.updatedInLast90Days,
      updatedMoreThan90DaysAgo: commodityStats.updatedMoreThan90DaysAgo,
      uniqueCommodities: commodityStats.uniqueCommodities
    },
    updatedInLastHour: commodityStats.updatedInLastHour + stationStats.updatedInLastHour,
    updatedInLast24Hours: commodityStats.updatedInLast24Hours + stationStats.updatedInLast24Hours,
    updatedInLast7Days: commodityStats.updatedInLast7Days + stationStats.updatedInLast7Days,
    updatedInLast30Days: commodityStats.updatedInLast30Days + stationStats.updatedInLast30Days,
    updatedInLast90Days: commodityStats.updatedInLast90Days + stationStats.updatedInLast90Days,
    updatedMoreThan90DaysAgo: commodityStats.updatedMoreThan90DaysAgo + stationStats.updatedMoreThan90DaysAgo,
    timestamp: new Date().toISOString()
  }
  if (!fs.existsSync(ARDENT_CACHE_DIR)) { fs.mkdirSync(ARDENT_CACHE_DIR, { recursive: true }) }
  fs.writeFileSync(ARDENT_DATABASE_STATS, JSON.stringify(stats, null, 2))
  console.timeEnd('Update database stats')
  process.exit()
})()
