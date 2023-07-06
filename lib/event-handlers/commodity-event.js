const { tradeDb, systemsDb } = require('../db')

const deleteCommoditiesForCarrierMarket = tradeDb.prepare(`
  DELETE FROM commodities WHERE fleetCarrier = 1 AND stationName = @stationName COLLATE NOCASE
`)

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
  const systemName = payload.message.systemName
  const stationName = payload.message.stationName
  const isFleetCarrier = stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$')
  const marketId = payload.message.marketId
  const updatedAt = new Date(payload.message.timestamp).toISOString()
  const system = selectSystemByName.get({ systemName })

  if (isFleetCarrier) {
    // As Fleet Carriers move around and can change at any time,
    // delete old commodity data for them when new data comes in.
    // @TODO Investigate if worth doing the same for stations
    // if commodities they trade in change over time.
    deleteCommoditiesForCarrierMarket.run({ stationName })
  }

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
      fleetCarrier: isFleetCarrier ? 1 : 0,
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
