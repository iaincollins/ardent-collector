const path = require('path')
const fs = require('fs')
const os = require('os')
const checkDiskSpace = require('check-disk-space').default
const fastFolderSizeSync = require('fast-folder-size/sync')
const byteSize = require('byte-size')
const {
  writeBackupLog,
  backupDatabase,
  verifyBackup
} = require('../lib/backup')

const {
  ARDENT_DATA_DIR,
  ARDENT_BACKUP_DIR,
  ARDENT_BACKUP_LOG
} = require('../lib/consts')

const TEN_KB_IN_BYTES = 10000
const TEN_MB_IN_BYTES = 10000000

const { locationsDb, tradeDb, stationsDb, systemsDb } = require('../lib/db')

;(async () => {
  console.log(`Writing backup log to ${ARDENT_BACKUP_LOG}`)
  if (!fs.existsSync(ARDENT_BACKUP_DIR)) { fs.mkdirSync(ARDENT_BACKUP_DIR, { recursive: true }) }

  const started = new Date().toISOString()
  const verifyResults = []

  writeBackupLog(`Starting backup at ${started}`, true)
  /** * PRE-FLIGHT CHECKS  ****/
  const pathToLocationsDbBackup = path.join(ARDENT_BACKUP_DIR, '/locations.db')
  const pathToTradeDbBackup = path.join(ARDENT_BACKUP_DIR, '/trade.db')
  const pathToStationsDbBackup = path.join(ARDENT_BACKUP_DIR, '/stations.db')
  const pathToSystemsDbBackup = path.join(ARDENT_BACKUP_DIR, '/systems.db')

  const dataDirSizeInBytes = (os.platform() !== 'win32') ? fastFolderSizeSync(ARDENT_DATA_DIR) : 0
  const freeDiskSpaceInBytes = (await checkDiskSpace(ARDENT_BACKUP_DIR)).free

  writeBackupLog('Checking disk space')
  // Note: fastFolderSize working on Linux and Mac but not Windows
  if (os.platform() !== 'win32') {
    writeBackupLog(`Total data size: ${byteSize(dataDirSizeInBytes)} (${dataDirSizeInBytes} bytes)`)
  }
  writeBackupLog(`Free disk space on backup volume: ${byteSize(freeDiskSpaceInBytes)} (${freeDiskSpaceInBytes} bytes)`)

  if (dataDirSizeInBytes > freeDiskSpaceInBytes) { throw Error('Insufficent free disk space to perform backup') }

  console.time('Backup complete')
  writeBackupLog(`Creating backups in ${ARDENT_BACKUP_DIR}`)

  writeBackupLog(`Backing up ${path.basename(pathToLocationsDbBackup)}`)
  backupDatabase(locationsDb, pathToLocationsDbBackup)
  verifyResults.push(verifyBackup(pathToLocationsDbBackup, ['locations'], TEN_KB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToTradeDbBackup)}`)
  backupDatabase(tradeDb, pathToTradeDbBackup)
  verifyResults.push(verifyBackup(pathToTradeDbBackup, ['commodities'], TEN_MB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToStationsDbBackup)}`)
  backupDatabase(stationsDb, pathToStationsDbBackup)
  verifyResults.push(verifyBackup(pathToStationsDbBackup, ['stations'], TEN_MB_IN_BYTES))

  writeBackupLog(`Backing up ${path.basename(pathToSystemsDbBackup)}`)
  backupDatabase(systemsDb, pathToSystemsDbBackup)
  verifyResults.push(verifyBackup(pathToSystemsDbBackup, ['systems'], TEN_MB_IN_BYTES))

  console.timeEnd('Backup complete')
  writeBackupLog(`Completed backup at ${new Date().toISOString()}`)

  // Save backup report to both backup dir and live data dir
  const backupReport = {
    started,
    completed: new Date().toISOString(),
    dataDir: ARDENT_DATA_DIR,
    backupDir: ARDENT_BACKUP_DIR,
    pathToSystemsDbBackup,
    pathToLocationsDbBackup,
    pathToTradeDbBackup,
    pathToStationsDbBackup,
    dataDirSizeInBytes,
    freeDiskSpaceInBytes,
    databases: verifyResults,
    timestamp: new Date().toISOString()
  }
  fs.writeFileSync(path.join(ARDENT_DATA_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))
  fs.writeFileSync(path.join(ARDENT_BACKUP_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))

  process.exit()
})()
