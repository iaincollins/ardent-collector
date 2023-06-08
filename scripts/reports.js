const {
  generateCommoditesReport,
  generateTradeReport
} = require('../lib/reports/trade-reports')

;(async () => {
  console.time('Generate commodities report')
  await generateCommoditesReport()
  console.timeEnd('Generate commodities report')

  console.time('Generate Core Systems commodities report')
  await generateTradeReport('core-systems-1000', 'Sol', 500, 1000)
  console.timeEnd('Generate Core Systems commodities report')

  console.time('Generate Colonia Systems commodities report')
  await generateTradeReport('colonia-systems-1000', 'Colonia', 500, 1000)
  console.timeEnd('Generate Colonia Systems commodities report')

  process.exit()
})()
