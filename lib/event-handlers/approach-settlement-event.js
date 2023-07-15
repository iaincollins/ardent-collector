const crypto = require('crypto')
const { insertOrReplaceInto } = require('../sql-helper')
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
      systemX:approachSettlementEvent.StarPos[0],
      systemY: approachSettlementEvent.StarPos[1],
      systemZ: approachSettlementEvent.StarPos[2],
      systemSector,
      updatedAt: new Date(approachSettlementEvent.timestamp).toISOString()
    })
  }

  if (!selectStationByNameAndSystemAddress.get({ stationName, systemAddress })) {
    insertOrReplaceInto(stationsDb, 'stations', {
      stationName,
      marketId: approachSettlementEvent.MarketID,
      stationType: 'Odyssey Settlement',
      systemAddress,
      systemName,
      systemX:approachSettlementEvent.StarPos[0],
      systemY: approachSettlementEvent.StarPos[1],
      systemZ: approachSettlementEvent.StarPos[2],
      bodyId: approachSettlementEvent.BodyID,
      bodyName:  approachSettlementEvent.BodyName,
      latitude:  approachSettlementEvent.Latitude,
      longitude:  approachSettlementEvent.Longitude,
      updatedAt: new Date(approachSettlementEvent.timestamp).toISOString()
    })
  }
}