const fs = require('fs')
const path = require('path')
const {
  ARDENT_CACHE_DIR,
  ARDENT_SYSTEMS_DB,
  ARDENT_LOCATIONS_DB,
  ARDENT_STATIONS_DB,
  ARDENT_TRADE_DB
} = require('../consts')
const { tradeDb, systemsDb } = require('../db')
const arrayOfRareCommodities = require('../data/rare-commodities.json')

const rareCommodities = {}
arrayOfRareCommodities.forEach(c => rareCommodities[c.symbol.toLocaleLowerCase()] = c)

const DELAY_BETWEEN_GENERATING_STATS = 0
const DEFAULT_REPORT_DISTANCE = 500
const DEFAULT_MINIMUM_TRADE_VOLUME = 1000

const BUSY_TIMEOUT_IN_MS = 5000
const MAX_MEMORY_SIZE_IN_BYTES = 1073741824 //  1GB

// Very rough estimate of how much more valuable rare items are when sold far away
// Is not very accurate for higher value rare goods, or items sold during special
// occations, but the raw market data we get doesn't explicitly list those prices
// (although I could build a database of those values from other sources)
const RARE_GOODS_VALUE_INCREASE = 16000

const sqlLiteDatabases = require('better-sqlite3')(':memory:', { readonly: false })
sqlLiteDatabases.pragma('journal_mode = WAL')
sqlLiteDatabases.pragma('wal_autocheckpoint = 0')
sqlLiteDatabases.pragma('query_only = true')
sqlLiteDatabases.pragma(`busy_timeout = ${BUSY_TIMEOUT_IN_MS}`)
// sqlLiteDatabases.pragma(`mmap_size = ${MAX_MEMORY_SIZE_IN_BYTES}`)

sqlLiteDatabases.exec(`attach '${ARDENT_STATIONS_DB}' as stations;`)
sqlLiteDatabases.exec(`attach '${ARDENT_TRADE_DB}' as trade;`)

async function updateCommodityStats () {

  const getMaxBuyPriceStmt = sqlLiteDatabases.prepare(`
    SELECT MAX(buyPrice) as maxBuyPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getMinBuyPriceStmt = sqlLiteDatabases.prepare(`
    SELECT MIN(buyPrice) as minBuyPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getAvgBuyPriceStmt = sqlLiteDatabases.prepare(`
    SELECT CAST(AVG(buyPrice) as INT) as avgBuyPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getTotalStockStmt = sqlLiteDatabases.prepare(`
    SELECT SUM(stock) as totalStock
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getMaxSellPriceStmt = sqlLiteDatabases.prepare(`
    SELECT MAX(sellPrice) as maxSellPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getMinSellPriceStmt = sqlLiteDatabases.prepare(`
    SELECT MIN(sellPrice) as minSellPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getAvgSellPriceStmt = sqlLiteDatabases.prepare(`
    SELECT CAST(AVG(sellPrice) as INT) as avgSellPrice
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= 1
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const getTotalDemandStmt = sqlLiteDatabases.prepare(`
    SELECT SUM(demand) as totalDemand
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND s.stationType != 'FleetCarrier'
    LIMIT 1
  `)
  const commodities = _getAllCommodities()
  for (const i in commodities) {
    const commodity = commodities[i]
    const { commodityName } = commodity

    //console.log('commodity:', commodityName)

    if (rareCommodities[commodityName.toLowerCase()]) {
      commodity.rare = true
      commodity.rareMarketId = parseInt(rareCommodities[commodityName.toLowerCase()].market_id)
      commodity.rareMaxCount = rareCommodities[commodityName.toLowerCase()]?.count ?? null

      // Sometimes we have a record of one but not the other (but they are always the same)
      // This could just be hard coded but I don't have a dataset to hand.
      const minBuyPrice = getMinBuyPriceStmt.get({ commodityName }).minBuyPrice
      const minSellPrice = getMinSellPriceStmt.get({ commodityName }).minSellPrice
      const minPrice = minBuyPrice ?? minSellPrice

      commodity.minBuyPrice = minPrice
      commodity.maxBuyPrice = minPrice
      commodity.avgBuyPrice = minPrice
      commodity.totalStock = null
      commodity.minSellPrice = minPrice
      commodity.maxSellPrice = minPrice ? minPrice + RARE_GOODS_VALUE_INCREASE : null
      commodity.avgSellPrice = minPrice ? parseInt(commodity.maxSellPrice / 2) : null
      commodity.totalDemand = null
    } else {
      commodity.minBuyPrice = getMinBuyPriceStmt.get({ commodityName }).minBuyPrice
      commodity.maxBuyPrice = getMaxBuyPriceStmt.get({ commodityName }).maxBuyPrice
      commodity.avgBuyPrice = getAvgBuyPriceStmt.get({ commodityName }).avgBuyPrice
      commodity.totalStock = getTotalStockStmt.get({ commodityName }).totalStock
      commodity.minSellPrice = getMinSellPriceStmt.get({ commodityName }).minSellPrice
      commodity.maxSellPrice = getMaxSellPriceStmt.get({ commodityName }).maxSellPrice
      commodity.avgSellPrice = getAvgSellPriceStmt.get({ commodityName }).avgSellPrice
      commodity.totalDemand = getTotalDemandStmt.get({ commodityName }).totalDemand
    }
    // Save standalone stats report just for for this commodity
    _saveReport(commodity.commodityName, commodity, `commodities/${commodity.commodityName}`)

    // Pause generating commodity reports to reduce load on service
    if (DELAY_BETWEEN_GENERATING_STATS > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATING_STATS))
    }
  }

  // Save stats report with data for all commodities in one file
  _saveReport('commodities', { commodities })

  return commodities
}

async function updateCommodityReport (
  reportName = null,
  systemName = 'Sol',
  distance = DEFAULT_REPORT_DISTANCE,
  minTradeVolume = DEFAULT_MINIMUM_TRADE_VOLUME
) {
  if (!reportName) reportName = `${systemName}-${distance}Ly-${minTradeVolume}T`
  const system = systemsDb.prepare('SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE').get({ systemName })
  let commodities = _getCommoditiesNearSystem(system, distance)
  for (const i in commodities) {
    const commodity = commodities[i]
    commodity.bestExporters = _getBestCommodityExporters(commodity.commodityName, minTradeVolume, system, distance)
    commodity.bestImporters = _getBestCommodityImporters(commodity.commodityName, minTradeVolume, system, distance)

    const meanPrices = [
      ...commodity.bestImporters?.map(c => c.meanPrice) ?? [],
      ...commodity.bestExporters?.map(c => c.meanPrice) ?? []
    ]
    commodity.meanPrice = meanPrices?.length > 0 ? parseInt(meanPrices.reduce((a, b) => a + b) / meanPrices.length) : null
    commodity.maxPriceDelta = commodity.meanPrice ? commodity.bestImporters?.[0]?.sellPrice ?? 0 - commodity.bestExporters?.[0]?.buyPrice ?? 0 : null

    _saveReport(reportName, commodities[i], `commodities/${commodity.commodityName}`)

    // Pause generating commodity reports to reduce load on service
    if (DELAY_BETWEEN_GENERATING_STATS > 0) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATING_STATS))
    }
  }

  commodities = commodities
    // Filter out items not really being traded
    // i.e. no importers OR exporters with active supply/demand above threshold
    .filter(c => c.meanPrice !== null)
    // Sort by highest value
    .sort((a, b) => b.maxPriceDelta - a.maxPriceDelta)

  const report = {
    name: reportName,
    description: `Commodities traded within ${distance}Ly of the ${systemName} system with minimum supply/demand of at least ${minTradeVolume}T.`,
    system,
    commodities
  }

  _saveReport(report.name, report)

  return report
}

function _getBestCommodityExporters (commodityName, minVolume, system, distance) {
  return sqlLiteDatabases.prepare(`
    SELECT c.*
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.stock >= @minVolume
      AND SQRT(POWER(c.systemX-@systemX,2)+POWER(c.systemY-@systemY,2)+POWER(c.systemZ-@systemZ,2)) < @distance
      AND s.stationType != 'FleetCarrier'
    ORDER BY c.buyPrice ASC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    distance
  })
}

function _getBestCommodityImporters (commodityName, minVolume, system, distance) {
  return sqlLiteDatabases.prepare(`
    SELECT c.*
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE c.commodityName = @commodityName COLLATE NOCASE
      AND c.demand >= @minVolume
      AND SQRT(POWER(c.systemX-@systemX,2)+POWER(c.systemY-@systemY,2)+POWER(c.systemZ-@systemZ,2)) < @distance
      AND s.stationType != 'FleetCarrier'
    ORDER BY c.sellPrice DESC
      LIMIT 10
    `).all({
    commodityName,
    minVolume,
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    distance
  })
}

function _getAllCommodities () {
  return sqlLiteDatabases
    .prepare(`
      SELECT DISTINCT(commodityName) FROM commodities ORDER BY commodityName ASC
    `)
    .all()
}

function _getCommoditiesNearSystem (system, distance = DEFAULT_REPORT_DISTANCE) {
  return sqlLiteDatabases.prepare(`
    SELECT DISTINCT(c.commodityName)
      FROM commodities c
      INNER JOIN stations s ON s.marketId = c.marketId
    WHERE SQRT(POWER(c.systemX-@systemX,2)+POWER(c.systemY-@systemY,2)+POWER(c.systemZ-@systemZ,2)) < @distance
      AND (c.stock > 0 OR c.demand > 0)
      AND s.stationType != 'FleetCarrier'
    ORDER BY c.commodityName ASC
  `).all({
    systemX: system?.systemX,
    systemY: system?.systemY,
    systemZ: system?.systemZ,
    distance
  })
}

function _saveReport (reportName, reportData, dir = null) {
  if (dir) {
    const commodityDir = path.join(ARDENT_CACHE_DIR, dir)
    if (!fs.existsSync(commodityDir)) { fs.mkdirSync(commodityDir, { recursive: true }) }
    reportData.timestamp = new Date().toISOString()
    const pathToFile = path.join(commodityDir, `${reportName}.json`)
    fs.writeFileSync(pathToFile, JSON.stringify(reportData, null, 2))
  } else {
    if (!fs.existsSync(ARDENT_CACHE_DIR)) { fs.mkdirSync(ARDENT_CACHE_DIR, { recursive: true }) }
    reportData.timestamp = new Date().toISOString()
    const pathToFile = path.join(ARDENT_CACHE_DIR, `${reportName}.json`)
    fs.writeFileSync(pathToFile, JSON.stringify(reportData, null, 2))
  }
}

module.exports = {
  updateCommodityStats,
  updateCommodityReport
}
