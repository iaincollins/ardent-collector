const crypto = require('crypto')
const { update, insertOrReplaceInto } = require('../sql-helper')
const { systemsDb, stationsDb } = require('../db')
const { SYSTEM_GRID_SIZE, SYSTEM_SECTOR_HASH_LENGTH } = require('../consts')

const selectSystemByAddress = systemsDb.prepare(`
  SELECT * FROM systems WHERE systemAddress = @systemAddress
`)

const selectStationByNameAndSystemAddress = stationsDb.prepare(`
  SELECT * FROM stations WHERE stationName = @stationName COLLATE NOCASE AND systemAddress = @systemAddress
`)

module.exports = (payload) => {
  const approachSettlementEvent = payload.message

  // Ignore systems submitted to without valid positions.
  // This should never happen.
  if ((approachSettlementEvent?.StarPos?.[0] ?? 0) === 0 &&
      (approachSettlementEvent?.StarPos?.[1] ?? 0) === 0 &&
      (approachSettlementEvent?.StarPos?.[2] ?? 0) === 0 &&
      (approachSettlementEvent.SystemName !== 'Sol')) { return }

  const stationName = approachSettlementEvent.Name
  const systemAddress = approachSettlementEvent.SystemAddress
  const systemName = approachSettlementEvent.StarSystem
  // const starClass = payload.message.StarClass // TODO Add Star Class info to Systems DB
  const systemXGrid = Math.floor(approachSettlementEvent.StarPos[0] / SYSTEM_GRID_SIZE)
  const systemYGrid = Math.floor(approachSettlementEvent.StarPos[1] / SYSTEM_GRID_SIZE)
  const systemZGrid = Math.floor(approachSettlementEvent.StarPos[2] / SYSTEM_GRID_SIZE)
  const systemSector = crypto.createHash('shake256', { outputLength: SYSTEM_SECTOR_HASH_LENGTH })
    .update(`${systemXGrid}, ${systemYGrid}, ${systemZGrid}`)
    .digest('hex')

  // Add system if it doesn't exist (it should, but in case it's missing for any reason!)
  if (!selectSystemByAddress.get({ systemAddress })) {
    insertOrReplaceSystem.run({
      systemAddress,
      systemName,
      systemX: approachSettlementEvent.StarPos[0],
      systemY: approachSettlementEvent.StarPos[1],
      systemZ: approachSettlementEvent.StarPos[2],
      systemSector,
      updatedAt: new Date(approachSettlementEvent.timestamp).toISOString()
    })
  }

  let stationType = 'Odyssey Settlement'
  // Guardian ruins come through with names like
  // '$Ancient_Small_005:#index=1;' or '$Ancient:#index=2;'
  // https://canonn.science/guardian-ruins-api-data-test/
  // Ideally would like to refactor this so names are more like
  // 'Small Guardian Structure, Type 5' (etc)
  if (stationName.startsWith('$Ancient_')) stationType = 'Guardian Structure'

  const stationData = {
    stationName,
    marketId: approachSettlementEvent?.MarketID,
    stationType,
    systemAddress,
    systemName,
    systemX: approachSettlementEvent.StarPos[0],
    systemY: approachSettlementEvent.StarPos[1],
    systemZ: approachSettlementEvent.StarPos[2],
    bodyId: approachSettlementEvent.BodyID,
    bodyName: approachSettlementEvent.BodyName,
    latitude: approachSettlementEvent.Latitude,
    longitude: approachSettlementEvent.Longitude,
    updatedAt: new Date(approachSettlementEvent.timestamp).toISOString()
  }

  // This inserts new settlment locations into DB and updates existing ones
  // with location information (which is not included in Docked events)
  if (selectStationByNameAndSystemAddress.get({ stationName, systemAddress })) {
    update(stationsDb, 'stations', stationData, 'stationName = @stationName AND @systemAddress = @systemAddress')
  } else {
    insertOrReplaceInto(stationsDb, 'stations', stationData)
  }
}
