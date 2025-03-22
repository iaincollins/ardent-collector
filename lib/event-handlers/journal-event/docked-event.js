const { stationsDb } = require('../../db')
const { update, insertOrReplaceInto } = require('../../sql-helper')

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
`)

module.exports = (payload) => {
  const { message } = payload

  if (!message?.MarketID) {
    // Only instances of I can find of this is in data for old mega ships
    console.error('Docked Event Missing Market ID', message)
    return
  }

  let stationType = message?.StationType
  // TODO Refactor into standard library function
  if (message?.StationType === 'FleetCarrier') stationType = 'Fleet Carrier'
  if (message?.StationType === 'Orbis') stationType = 'Orbis Starport'
  if (message?.StationType === 'Coriolis') stationType = 'Coriolis Starport'
  if (message?.StationType === 'Ocellus') stationType = 'Ocellus Starport'
  if (message?.StationType === 'Outpost') stationType = 'Outpost'
  if (message?.StationType === 'SurfaceStation') stationType = 'Planetary Port'
  if (message?.StationType === 'CraterPort') stationType = 'Planetary Port'
  if (message?.StationType === 'CraterOutpost') stationType = 'Planetary Outpost'
  if (message?.StationType === 'OnFootSettlement') stationType = 'Odyssey Settlement'
  if (message?.StationType === 'MegaShip') stationType = 'Megaship'
  if (message?.StationType === 'AsteroidBase') stationType = 'Asteroid Base'

  let maxLandingPadSize
  if (message?.LandingPads?.Small > 0) maxLandingPadSize = 1
  if (message?.LandingPads?.Medium > 0) maxLandingPadSize = 2
  if (message?.LandingPads?.Large > 0) maxLandingPadSize = 3

  if (!maxLandingPadSize) {
    if (message?.StationType === 'FleetCarrier') maxLandingPadSize = 3
    if (message?.StationType === 'Orbis') maxLandingPadSize = 3
    if (message?.StationType === 'Coriolis') maxLandingPadSize = 3
    if (message?.StationType === 'Ocellus') maxLandingPadSize = 3
    if (message?.StationType === 'AsteroidBase') maxLandingPadSize = 3
    if (message?.StationType === 'Outpost') maxLandingPadSize = 2
    if (message?.StationType === 'CraterPort') maxLandingPadSize = 3
    if (message?.StationType === 'CraterOutpost') maxLandingPadSize = 3
  }

  const stationData = {
    marketId: message?.MarketID,
    stationName: message?.StationName,
    distanceToArrival: message?.DistFromStarLS ?? null,
    stationType,
    allegiance: message?.StationAllegiance ?? null,
    government: message?.StationType === 'FleetCarrier' ? 'Fleet Carrier' : message?.StationGovernment.replace('$government_', '').replace(';', '') ?? null,
    controllingFaction: message?.StationType === 'FleetCarrier' ? null : message?.StationFaction?.Name ?? null,
    primaryEconomy: message?.StationType === 'FleetCarrier' ? 'Fleet Carrier' : message?.StationEconomies?.[0]?.Name.replace('$economy_', '').replace(';', '') ?? null,
    secondaryEconomy: message?.StationEconomies?.[1]?.Name.replace('$economy_', '').replace(';', '') ?? null,
    shipyard: message?.StationServices.includes('shipyard') ? 1 : 0,
    outfitting: message?.StationServices.includes('outfitting') ? 1 : 0,
    blackMarket: message?.StationServices.includes('blackmarket') ? 1 : 0,
    contacts: message?.StationServices.includes('contacts') ? 1 : 0,
    crewLounge: message?.StationServices.includes('crewlounge') ? 1 : 0,
    interstellarFactors: message?.StationServices.includes('facilitator') ? 1 : 0,
    materialTrader: message?.StationServices.includes('materialtrader') ? 1 : 0,
    missions: message?.StationServices.includes('missions') ? 1 : 0,
    refuel: message?.StationServices.includes('refuel') ? 1 : 0,
    repair: message?.StationServices.includes('repair') ? 1 : 0,
    restock: message?.StationServices.includes('restock') ? 1 : 0,
    searchAndRescue: message?.StationServices.includes('searchrescue') ? 1 : 0,
    technologyBroker: message?.StationServices.includes('techBroker') ? 1 : 0,
    tuning: message?.StationServices.includes('tuning') ? 1 : 0,
    universalCartographics: message?.StationServices.includes('exploration') ? 1 : 0,
    systemAddress: message?.SystemAddress,
    systemName: message?.StarSystem,
    systemX: message?.StarPos[0] ?? null,
    systemY: message?.StarPos[1] ?? null,
    systemZ: message?.StarPos[2] ?? null,
    maxLandingPadSize,
    updatedAt: new Date().toISOString()
  }

  // Ignore these entries with non-human readable names (seem to be colony ships)
  if (stationData.stationName.startsWith('$EXT_PANEL_')) return
  //if (stationData.stationName.startsWith('Orbital Construction Site:') || stationData.stationName.startsWith('Planetary Construction Site:') ) return

  // Somehow data without LandingPads info is (rarely) coming through, but other
  // data seems fine. It might be from an old client version of Elite or an appW
  // that uses EDDB.
  if (maxLandingPadSize) stationData.maxLandingPadSize = maxLandingPadSize

  if (selectStationByMarketId.get({ marketId: message?.MarketID })) {
    update(stationsDb, 'stations', stationData, 'marketId = @marketId')
  } else {
    insertOrReplaceInto(stationsDb, 'stations', stationData)
  }
}
