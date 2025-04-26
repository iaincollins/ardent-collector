const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')
const { getISOTimestamp } = require('../lib/utils/dates')

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

  stationsDb.exec(`DELETE FROM stations WHERE stationName = 'System Colonisation Ship'`)
  stationsDb.exec(`DELETE FROM stations WHERE stationName = '$EXT_PANEL_ColonisationShip'`)
  tradeDb.exec(`DELETE FROM commodities WHERE stationName = 'System Colonisation Ship'`)
  tradeDb.exec(`DELETE FROM commodities WHERE stationName = '$EXT_PANEL_ColonisationShip'`)

  // Very specific order for this clean up of fleet carrier entries
  stationsDb.exec(`UPDATE stations SET primaryEconomy = 'Carrier' WHERE stationType = 'Fleet Carrier' OR primaryEconomy = 'Fleet Carrier'`)
  stationsDb.exec(`UPDATE stations SET stationType = 'FleetCarrier' WHERE primaryEconomy = 'Carrier'`)
  stationsDb.exec(`UPDATE stations SET primaryEconomy = NULL, secondaryEconomy = NULL, government = NULL, allegiance = NULL, controllingFaction = NULL, bodyId = NULL, bodyName = null WHERE stationType = 'FleetCarrier'`)

  stationsDb.exec(`UPDATE stations SET primaryEconomy = 'Agriculture' WHERE primaryEconomy = 'Agri'`)
  stationsDb.exec(`UPDATE stations SET secondaryEconomy = 'Agriculture' WHERE secondaryEconomy = 'Agri'`)

  stationsDb.exec(`UPDATE stations SET primaryEconomy = 'HighTech' WHERE primaryEconomy = 'High Tech'`)
  stationsDb.exec(`UPDATE stations SET secondaryEconomy = 'HighTech' WHERE secondaryEconomy = 'High Tech'`)

  console.timeEnd('Startup maintenance')
}