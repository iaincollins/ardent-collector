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

  locationsDb.exec(`DELETE FROM locations WHERE locationName LIKE 'Planetary Construction Site: %'`)
  stationsDb.exec(`DELETE FROM stations WHERE stationType = 'DockablePlanetStation'`)

  console.timeEnd('Startup maintenance')
}