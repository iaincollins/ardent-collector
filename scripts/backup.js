const path = require('path')
const fs = require('fs')
const os = require('os')
const checkDiskSpace = require('check-disk-space').default
const fastFolderSizeSync = require('fast-folder-size/sync')
const byteSize = require('byte-size')
const SqlLiteDatabase = require('better-sqlite3')

const {
  ARDENT_DATA_DIR,
  ARDENT_BACKUP_DIR,
  ARDENT_BACKUP_LOG
} = require('../lib/consts')

const { systemsDb, tradeDb } = require('../lib/db')

const MIN_SIZE_IN_BYTES_BACKUP_VALIDATION = 10000000 // 10 MB
const MIN_ROWS_FOR_BACKUP_VALIDATION = 100

;(async () => {
  console.log(`Writing backup log to ${ARDENT_BACKUP_LOG}`)

  const started = new Date().toISOString()
  const verifyResults = []

  writeBackupLog(`Starting backup at ${started}`, true)
  /** * PRE-FLIGHT CHECKS  ****/
  const pathToSystemsDbBackup = path.join(ARDENT_BACKUP_DIR, '/systems.db')
  const pathToTradeDbBackup = path.join(ARDENT_BACKUP_DIR, '/trade.db')

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
  if (!fs.existsSync(ARDENT_BACKUP_DIR)) { fs.mkdirSync(ARDENT_BACKUP_DIR, { recursive: true }) }

  writeBackupLog(`Backing up ${path.basename(pathToTradeDbBackup)}`)
  backupDatabase(tradeDb, pathToTradeDbBackup)
  verifyResults.push(verifyBackup(pathToTradeDbBackup, ['commodities']))

  writeBackupLog(`Backing up ${path.basename(pathToSystemsDbBackup)}`)
  backupDatabase(systemsDb, pathToSystemsDbBackup)
  verifyResults.push(verifyBackup(pathToSystemsDbBackup, ['systems']))

  console.timeEnd('Backup complete')
  writeBackupLog(`Completed backup at ${new Date().toISOString()}`)

  // Save backup report to both backup dir and live data dir
  const backupReport = {
    started,
    completed: new Date().toISOString(),
    dataDir: ARDENT_DATA_DIR,
    backupDir: ARDENT_BACKUP_DIR,
    pathToSystemsDbBackup,
    pathToTradeDbBackup,
    dataDirSizeInBytes,
    freeDiskSpaceInBytes,
    databases: verifyResults,
    timestamp: new Date().toISOString()
  }
  fs.writeFileSync(path.join(ARDENT_DATA_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))
  fs.writeFileSync(path.join(ARDENT_BACKUP_DIR, 'backup.json'), JSON.stringify(backupReport, null, 2))

  process.exit()
})()

function writeBackupLog (text, reset = false) {
  const line = `${new Date().toISOString()}: ${text}\n`
  if (reset === true || !fs.existsSync(ARDENT_BACKUP_LOG)) {
    fs.writeFileSync(ARDENT_BACKUP_LOG, line)
  } else {
    fs.appendFileSync(ARDENT_BACKUP_LOG, line)
  }
}

function backupDatabase (dbToBackup, pathToBackupTargetLocation) {
  console.log(`Backing up ${path.basename(pathToBackupTargetLocation)} …`)
  console.time(`Backed up ${path.basename(pathToBackupTargetLocation)}`)
  fs.rmSync(pathToBackupTargetLocation, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-journal}`, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-shm`, { force: true })
  fs.rmSync(`${pathToBackupTargetLocation}-wal`, { force: true })
  dbToBackup.exec(`VACUUM INTO '${pathToBackupTargetLocation}'`)
  console.timeEnd(`Backed up ${path.basename(pathToBackupTargetLocation)}`)
}

function verifyBackup (pathToBackupTargetLocation, tables) {
  console.time(`Verified backup of ${path.basename(pathToBackupTargetLocation)}`)
  const { size: dbSize } = fs.statSync(pathToBackupTargetLocation)
  writeBackupLog(`Backup of ${path.basename(pathToBackupTargetLocation)} is ${byteSize(dbSize)} (${dbSize} bytes)`)
  if (dbSize < MIN_SIZE_IN_BYTES_BACKUP_VALIDATION) { throw Error(`${pathToBackupTargetLocation} file size smaller than expected`) }

  // Open connection to DB and set Write Ahead Log mode on it
  const db = new SqlLiteDatabase(pathToBackupTargetLocation)
  db.pragma('journal_mode = WAL')

  const result = {
    name: path.basename(pathToBackupTargetLocation),
    size: dbSize,
    tables: {}
  }

  for (const table of tables) {
    const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count
    result.tables[table] = rowCount
    writeBackupLog(`Backup of ${pathToBackupTargetLocation} table '${table}' has ${rowCount.toLocaleString('en-GB')} entries`)
    if (rowCount < MIN_ROWS_FOR_BACKUP_VALIDATION) { throw Error(`${pathToBackupTargetLocation} row count for '${table}' smaller than expected`) }
  }

  db.close()
  console.timeEnd(`Verified backup of ${path.basename(pathToBackupTargetLocation)}`)

  return result
}
