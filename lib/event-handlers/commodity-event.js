const { tradeDb, systemsDb } = require('../db')

const selectSystemByName = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemName = @systemName COLLATE NOCASE
`)

const insertOrReplaceCommodity = tradeDb.prepare(`
  INSERT OR REPLACE INTO commodities (
    commodityId,
    commodityName,
    marketId,
    stationName,
    systemName,
    systemX,
    systemY,
    systemZ,
    fleetCarrier,
    buyPrice,
    demand,
    demandBracket,
    meanPrice,
    sellPrice,
    stock,
    stockBracket,
    statusFlags,
    updatedAt
  ) VALUES (
    @commodityId,
    @commodityName,
    @marketId,
    @stationName,
    @systemName,
    @systemX,
    @systemY,
    @systemZ,
    @fleetCarrier,
    @buyPrice,
    @demand,
    @demandBracket,
    @meanPrice,
    @sellPrice,
    @stock,
    @stockBracket,
    @statusFlags,
    @updatedAt
  )
`)

module.exports = (payload) => {
  const stationName = payload.message.stationName
  const systemName = payload.message.systemName
  const marketId = payload.message.marketId
  const updatedAt = new Date(payload.message.timestamp).toISOString()
  const system = selectSystemByName.get({ systemName })

  for (const commodity of payload.message.commodities) {
    // Some events have strings strings like '$gold_name;' instead of 'gold',
    // while others send the actual string value (e.g. 'Gold' with a capital G)
    // Don't know if this is a bug in ED Journal and/or in apps sending to EDDN.
    // Regardless, this attempts to resolve the issue by cleaning them up.
    const commodityName = commodity.name
      .toLowerCase()
      .replace(/^\$/, '')
      .replace(/_name;$/, '')

    insertOrReplaceCommodity.run({
      commodityId: `${marketId}_${commodityName}`,
      commodityName,
      marketId,
      stationName,
      systemName,
      systemX: system?.systemX ?? null,
      systemY: system?.systemY ?? null,
      systemZ: system?.systemZ ?? null,
      fleetCarrier: stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$') ? 1 : 0,
      buyPrice: commodity.buyPrice,
      demand: commodity.demand,
      demandBracket: commodity.demandBracket,
      meanPrice: commodity.meanPrice,
      sellPrice: commodity.sellPrice,
      stock: commodity.stock,
      stockBracket: commodity.stockBracket,
      statusFlags: commodity?.statusFlags?.join(', ') ?? null,
      updatedAt
    })
  }
}
