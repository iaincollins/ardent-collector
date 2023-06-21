const {
  updateCommodityStats,
  updateCommodityReport
} = require('../../lib/stats/commodity-stats')

;(async () => {
  console.log('Updating stats for commodities…')
  console.time('Update stats for commodities')
  await updateCommodityStats()
  console.timeEnd('Update stats for commodities')

  console.log('Updating Core Systems commodity data…')
  console.time('Update Core Systems commodity data')
  await updateCommodityReport('core-systems-1000', 'Sol', 500, 1000)
  console.timeEnd('Update Core Systems commodity data')

  console.log('Updating Colonia Systems commodity data…')
  console.time('Update Colonia Systems commodity data')
  await updateCommodityReport('colonia-systems-1000', 'Colonia', 500, 1000)
  console.timeEnd('Update Colonia Systems commodity data')

  process.exit()
})()
