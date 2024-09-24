const path = require('path')
const fs = require('fs')
const os = require('os')
const checkDiskSpace = require('check-disk-space').default
const fastFolderSizeSync = require('fast-folder-size/sync')
const byteSize = require('byte-size')
const SqlLiteDatabase = require('better-sqlite3')
const { execSync } = require('child_process')

const {
  ARDENT_DATA_DIR,
  ARDENT_BACKUP_DIR,
  ARDENT_BACKUP_LOG
} = require('../lib/consts')

const { locationsDb, tradeDb, stationsDb, systemsDb } = require('../lib/db')

const TEN_KB_IN_BYTES = 10000
const TEN_MB_IN_BYTES = 10000000
const MIN_ROWS_FOR_BACKUP_VALIDATION = 100

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

  // Temporarily leaving backup compression disabled, as needs to be de-coupled
  // from the main backup job, to avoid exending the main backup task runtime.
  /*
  const compressedBackups = []
  compressedBackups.push(compressDatabase(pathToLocationsDbBackup))
  compressedBackups.push(compressDatabase(pathToTradeDbBackup))
  compressedBackups.push(compressDatabase(pathToStationsDbBackup))
  compressedBackups.push(compressDatabase(pathToSystemsDbBackup))
  */

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
    // compressedBackups,
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

function verifyBackup (pathToBackupTargetLocation, tables, minDbSizeInBytes) {
  console.time(`Verified backup of ${path.basename(pathToBackupTargetLocation)}`)
  const { size: dbSize } = fs.statSync(pathToBackupTargetLocation)
  writeBackupLog(`Backup of ${path.basename(pathToBackupTargetLocation)} is ${byteSize(dbSize)} (${dbSize} bytes)`)
  if (dbSize < minDbSizeInBytes) { throw Error(`${pathToBackupTargetLocation} file size smaller than expected`) }

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

function compressDatabase(pathToDatabase) {
  console.log(`Compressing ${path.basename(pathToDatabase)} …`)
  console.time(`Compressed ${path.basename(pathToDatabase)}`)
  const pathToOutput = `${pathToDatabase}.gz`
  const pathToTmpOutput = `${pathToDatabase}.tmp.gz`
  execSync(`gzip -cf ${pathToDatabase} > ${pathToTmpOutput}`, (error, stdout, stderr) => {
    if (error) console.error(error)
  })
  fs.renameSync(pathToTmpOutput,pathToOutput)
  const { size: oldSize } = fs.statSync(pathToDatabase)
  const { size: newSize } = fs.statSync(pathToOutput)
  console.log(`Saved compressed backup to ${path.basename(pathToOutput)} (${byteSize(newSize)}), saved ${byteSize(oldSize - newSize)}`)
  console.timeEnd(`Compressed ${path.basename(pathToDatabase)}`)
  return {
    name: path.basename(pathToOutput),
    size: newSize
  }
}
