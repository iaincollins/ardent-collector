const fs = require('fs')
const path = require('path')
const { ARDENT_REPORTS_DIR } = require('../consts')
const { tradeDb, systemsDb } = require('../db')

const PAUSE_BETWEEN_COMMODITIES = 500
const DEFAULT_REPORT_DISTANCE = 500
const DEFAULT_MINIMUM_TRADE_VOLUME = 1000

async function generateCommoditesReport () {
  const getMaxBuyPriceStmt = tradeDb.prepare(`
    SELECT MAX(buyPrice) as maxBuyPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND stock >= 1
    LIMIT 1
  `)
  const getMinBuyPriceStmt = tradeDb.prepare(`
    SELECT MIN(buyPrice) as minBuyPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND stock >= 1
    LIMIT 1
  `)
  const getAvgBuyPriceStmt = tradeDb.prepare(`
    SELECT CAST(AVG(buyPrice) as INT) as avgBuyPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND stock >= 1
    LIMIT 1
  `)
  const getTotalStockStmt = tradeDb.prepare(`
    SELECT SUM(stock) as totalStock
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
    LIMIT 1
  `)
  const getMaxSellPriceStmt = tradeDb.prepare(`
    SELECT MAX(sellPrice) as maxSellPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND demand >= 1
    LIMIT 1
  `)
  const getMinSellPriceStmt = tradeDb.prepare(`
    SELECT MIN(sellPrice) as minSellPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND demand >= 1
    LIMIT 1
  `)
  const getAvgSellPriceStmt = tradeDb.prepare(`
    SELECT CAST(AVG(sellPrice) as INT) as avgSellPrice
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND demand >= 1
    LIMIT 1
  `)
  const getTotalDemandStmt = tradeDb.prepare(`
    SELECT SUM(demand) as totalDemand
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
    LIMIT 1
  `)
  const commodities = _getCommodities()
  for (const i in commodities) {
    const commodity = commodities[i]
    const { commodityName } = commodity
    commodity.maxBuyPrice = getMaxBuyPriceStmt.get({ commodityName }).maxBuyPrice
    commodity.minBuyPrice = getMinBuyPriceStmt.get({ commodityName }).minBuyPrice
    commodity.avgBuyPrice = getAvgBuyPriceStmt.get({ commodityName }).avgBuyPrice
    commodity.totalStock = getTotalStockStmt.get({ commodityName }).totalStock
    commodity.maxSellPrice = getMaxSellPriceStmt.get({ commodityName }).maxSellPrice
    commodity.minSellPrice = getMinSellPriceStmt.get({ commodityName }).minSellPrice
    commodity.avgSellPrice = getAvgSellPriceStmt.get({ commodityName }).avgSellPrice
    commodity.totalDemand = getTotalDemandStmt.get({ commodityName }).totalDemand

    // Pause generating commodity reports to reduce load on service
    if (PAUSE_BETWEEN_COMMODITIES > 0) {
      await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_COMMODITIES))
    }
  }

  const report = { commodities }

  // Save report for this commodity as we go
  _saveReport('commodities', report)

  return report
}

async function generateTradeReport (
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

    _saveTradeReportForCommodity(reportName, commodity.commodityName, commodities[i])

    // Pause generating commodity reports to reduce load on service
    if (PAUSE_BETWEEN_COMMODITIES > 0) {
      await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_COMMODITIES))
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
  return tradeDb.prepare(`
    SELECT *
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND stock >= @minVolume
      AND SQRT(POWER(systemX-@systemX,2)+POWER(systemY-@systemY,2)+POWER(systemZ-@systemZ,2)) < @distance
    ORDER BY buyPrice ASC
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
  return tradeDb.prepare(`
    SELECT *
      FROM commodities
    WHERE commodityName = @commodityName COLLATE NOCASE
      AND fleetCarrier = 0
      AND demand >= @minVolume
      AND SQRT(POWER(systemX-@systemX,2)+POWER(systemY-@systemY,2)+POWER(systemZ-@systemZ,2)) < @distance
    ORDER BY sellPrice DESC
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

function _getCommodities (systemName, distance) {
  if (systemName) {
    const system = systemsDb
      .prepare('SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE')
      .get({ systemName })
    return _getCommoditiesNearSystem(system, distance)
  } else {
    return tradeDb
      .prepare(`
        SELECT DISTINCT(commodityName)
          FROM commodities
        WHERE fleetCarrier = 0
          AND (stock > 0 OR demand > 0)
        ORDER BY commodityName ASC
      `)
      .all()
  }
}

function _getCommoditiesNearSystem (system, distance = DEFAULT_REPORT_DISTANCE) {
  return tradeDb.prepare(`
    SELECT DISTINCT(commodityName)
      FROM commodities
    WHERE SQRT(POWER(systemX-@systemX,2)+POWER(systemY-@systemY,2)+POWER(systemZ-@systemZ,2)) < @distance
      AND fleetCarrier = 0
      AND (stock > 0 OR demand > 0)
    ORDER BY commodityName ASC
  `).all({
    systemX: system.systemX,
    systemY: system.systemY,
    systemZ: system.systemZ,
    distance
  })
}

function _saveTradeReportForCommodity (reportName, commodityName, commodityReport) {
  const reportDir = path.join(ARDENT_REPORTS_DIR, reportName)
  if (!fs.existsSync(reportDir)) { fs.mkdirSync(reportDir, { recursive: true }) }

  commodityReport.timestamp = new Date().toISOString()

  const pathToFile = path.join(reportDir, `${commodityName}.json`)
  fs.writeFileSync(pathToFile, JSON.stringify(commodityReport, null, 2))
}

function _saveReport (reportName, report) {
  if (!fs.existsSync(ARDENT_REPORTS_DIR)) { fs.mkdirSync(ARDENT_REPORTS_DIR, { recursive: true }) }

  report.timestamp = new Date().toISOString()

  const pathToFile = path.join(ARDENT_REPORTS_DIR, `${reportName}.json`)
  fs.writeFileSync(pathToFile, JSON.stringify(report, null, 2))
}

module.exports = {
  generateCommoditesReport,
  generateTradeReport
}
