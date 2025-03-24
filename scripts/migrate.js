const { systemsDb, locationsDb, stationsDb, tradeDb } = require('../lib/db')

console.time('Migration')

stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Stronghold Carrier'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Hochburg-Carrier'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Portanaves bastión'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Porte-vaisseaux de forteresse'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Transportadora da potência'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Носитель-база'`)
stationsDb.exec(`UPDATE stations SET stationName = 'Stronghold Carrier', stationType = 'StrongholdCarrier' WHERE stationName = 'Stronghold Carrier'`)

console.timeEnd('Migration')

process.exit()
