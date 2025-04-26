const { systemsDb, stationsDb, tradeDb } = require('../db')
const { insertOrReplaceInto } = require('../sql-helper')

const deleteCarrierMarketData = tradeDb.prepare(`
  DELETE FROM commodities WHERE fleetCarrier = 1 AND stationName = @stationName COLLATE NOCASE
`)

const updateCarrierLocationByName = stationsDb.prepare(`
  UPDATE stations SET
    systemName = @systemName,
    systemAddress = @systemAddress,
    systemX = @systemX,
    systemY = @systemY,
    systemZ = @systemZ,
    updatedAt = @updatedAt
  WHERE stationName = @stationName COLLATE NOCASE 
  AND stationType = 'FleetCarrier'
`)

const selectCarrierByName = stationsDb.prepare(`
  SELECT * FROM stations
  WHERE stationName = @stationName COLLATE NOCASE 
  AND stationType = 'FleetCarrier'
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
    updatedAt,
    updatedAtDay
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
    @updatedAt,
    @updatedAtDay
  )
`)

module.exports = (payload) => {
  const systemName = payload.message.systemName
  let stationName = payload.message?.stationName
  const isFleetCarrier = stationName.match('^[A-Z0-9]{3}-[A-Z0-9]{3}$')
  const marketId = payload.message.marketId
  const updatedAt = new Date(payload.message.timestamp).toISOString()
  const updatedAtDay = new Date(payload.message.timestamp).toISOString().split('T')[0]
  const system = selectSystemByName.get({ systemName })
  
  if (  // Ignore System Colonisation Ship (at least for now)
        stationName.startsWith('$EXT_PANEL_ColonisationShip') ||
        stationName == 'System Colonisation Ship'
      ) return

  // Normalize Stronghold Carrier names
  if (stationName == 'Stronghold Carrier' ||
      stationName == 'Hochburg-Carrier' ||
      stationName == 'Portanaves bastión' ||
      stationName == 'Porte-vaisseaux de forteresse' ||
      stationName == 'Transportadora da potência' ||
      stationName == 'Носитель-база' ||
      stationName.startsWith('$ShipName_StrongholdCarrier') 
      ) {
        stationName = 'Stronghold Carrier'
  }

  if (isFleetCarrier) {
    // As Fleet Carriers move around and can change at any time,
    // delete old commodity data for them when new data comes in.
    // @TODO Investigate if worth doing the same for stations
    // if commodities they trade in change over time.
    deleteCarrierMarketData.run({ stationName })

    if (selectCarrierByName.get({ stationName })) {
      // If carrier in database then update location
      updateCarrierLocationByName.run({
        stationName,
        systemAddress: system?.systemAddress,
        systemName,
        systemX: system?.systemX ?? null,
        systemY: system?.systemY ?? null,
        systemZ: system?.systemZ ?? null,
        updatedAt
      })
    } else {
      // If carrier not in database add it (even if we don't know services yet)
      insertOrReplaceInto(stationsDb, 'stations', {
        stationName,
        marketId,
        stationType: 'FleetCarrier',
        systemAddress: system?.systemAddress,
        systemName,
        systemX: system?.systemX ?? null,
        systemY: system?.systemY ?? null,
        systemZ: system?.systemZ ?? null,
        updatedAt
      })
    }
  } else {
    // TODO Check if is Megaship (including a Rescue Ship) and update location
    // to reflect if Megaship has moved to a new system since we last saw it
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
      updatedAt,
      updatedAtDay
    })
  }
}
