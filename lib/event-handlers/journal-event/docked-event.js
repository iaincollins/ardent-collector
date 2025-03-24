const { stationsDb } = require('../../db')
const { update, insertOrReplaceInto } = require('../../sql-helper')
const stationTypes = require('../../station-types')

const selectStationByMarketId = stationsDb.prepare(`
  SELECT * FROM stations WHERE marketId = @marketId
`)

module.exports = (payload) => {
  const { message } = payload

  if (!message?.MarketID) {
    // Only instances of I can find of this is in data for old megaships
    console.error('Docked Event Missing Market ID', message)
    return
  }

  let stationName = message?.StationName
  let stationType = message?.StationType

  // Ignore System Colonisation Ship (at least for now)
  if (stationName.startsWith('$EXT_PANEL_ColonisationShip')) return

  // There is no offical FDev type for Stronghold Carriers but it's useful to have one
  if (stationName == 'Stronghold Carrier' ||
      stationName == 'Hochburg-Carrier' ||
      stationName == 'Portanaves bastión' ||
      stationName == 'Porte-vaisseaux de forteresse' ||
      stationName == 'Transportadora da potência' ||
      stationName == 'Носитель-база' ||
      stationName.startsWith('$ShipName_StrongholdCarrier') 
      ) {
        stationName = 'Stronghold Carrier'
        stationType = 'StrongholdCarrier'
      }

  if (!stationTypes.includes(stationType)) {
    console.warn('Unknown Station Type: ', message?.StationType,  message?.StationName,  message?.StationName)
  }

  let maxLandingPadSize
  if (message?.LandingPads?.Small > 0) maxLandingPadSize = 1
  if (message?.LandingPads?.Medium > 0) maxLandingPadSize = 2
  if (message?.LandingPads?.Large > 0) maxLandingPadSize = 3

  // This is to handle message wher the LandingPads information is missing
  if (!maxLandingPadSize) {
    if (message?.StationType === 'Outpost') {
        maxLandingPadSize = 2 // All Outposts support up to medium pads only
    } else if (stationTypes.includes(stationType) && stationType !== 'OnFootSettlement') {
      // If it's a known station type AND it's not an Outpost or an Odyssey Settlement then 
      // it supports large landing pads. Odyssey Settlement CAN support large landing pads,
      // but the don't all support them (they can be small or medium only) so we don't make
      // any assumptions about them, but we can for other station types.
      maxLandingPadSize = 3
    }
  }

  const stationData = {
    marketId: message?.MarketID,
    stationName: stationName,
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


  // I think we can catch these by type, leaving in for now, happy to clean up this later
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
