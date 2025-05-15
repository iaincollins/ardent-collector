const {
  updateCommodityStats,
  updateCommodityReport
} = require('../../lib/stats/commodity-stats')

;(async () => {
  console.log('Updating stats for commodities…')

  // FIXME: The commodity stats should be updated to once again ignore
  // data from Fleet Carriers before it is enabled again
  /*
  console.time('Update stats for commodities')
  await updateCommodityStats()
  console.timeEnd('Update stats for commodities')
  */

  // The reports will be need to be updated to join with the stations table as
  // it relies on system positional data which is no longer in the trade db
  /*
  console.log('Updating Core Systems commodity data…')
  console.time('Update Core Systems commodity data')
  await updateCommodityReport('core-systems-1000', 'Sol', 500, 1000)
  console.timeEnd('Update Core Systems commodity data')

  console.log('Updating Colonia Systems commodity data…')
  console.time('Update Colonia Systems commodity data')
  await updateCommodityReport('colonia-systems-1000', 'Colonia', 500, 1000)
  console.timeEnd('Update Colonia Systems commodity data')
  */

  process.exit()
})()
