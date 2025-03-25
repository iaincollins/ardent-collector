const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')

// The purpose of this is to be a place for any logic that needs to run at 
// startup, before the service goes back online. It is not a script in the 
// typical sense, in that it can / should only be invoked from the main
// thread, when the database is not otherwise being written to.
//
// The use case is primarily to support releases that involve changes to data 
// in any of the databases (e.g. after refactoring, bug fixes, etc).
//
// The intention is that it should be safe to run any of these tasks multiple
// times, and that once they have been run at least once in production, any
// actions configured to run here will be removed from subsequent releases.

module.exports = async () => {
  console.time('Startup maintenance')

  console.log("Performing maintenance tasks...")

  // v2.3.0
  // One-time migration of normalize data in the stations and commodities databases
  stationsDb.exec(`UPDATE stations SET stationType = 'MegaShip' WHERE stationType = 'Megaship'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Stronghold Carrier'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Hochburg-Carrier'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Portanaves bastión'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Porte-vaisseaux de forteresse'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Transportadora da potência'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Носитель-база'`)
  stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Stronghold Carrier'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Stronghold'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Hochburg-Carrier'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Portanaves bastión'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Porte-vaisseaux de forteresse'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Transportadora da potência'`)
  tradeDb.exec(`UPDATE commodities SET stationName = 'Stronghold Carrier' WHERE stationName = 'Носитель-база'`)

  console.timeEnd('Startup maintenance')
}