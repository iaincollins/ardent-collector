const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const getFileHash = require('../lib/utils/get-file-hash')
const byteSize = require('byte-size')

const { ARDENT_BACKUP_DIR } = require('../lib/consts')

const pathToBackupDownloadManifest = path.join(ARDENT_BACKUP_DIR, 'backup-downloads.json')

const databasesToBackup = [
  path.join(ARDENT_BACKUP_DIR, '/locations.db'),
  path.join(ARDENT_BACKUP_DIR, '/trade.db'),
  path.join(ARDENT_BACKUP_DIR, '/stations.db'),
  path.join(ARDENT_BACKUP_DIR, '/systems.db')
]

;(async () => {
  console.log('Compressing backups …')
  console.time('Compressed backups')
  const backupDownloadManifest = {}

  for (const pathToDatabase of databasesToBackup) {
    console.log(`Compressing ${path.basename(pathToDatabase)} …`)
    console.time(`Compressed ${path.basename(pathToDatabase)}`)
    const pathToOutput = `${pathToDatabase}.gz`
    const pathToTmpOutput = `${pathToDatabase}.tmp.gz`
    execSync(`gzip -cf ${pathToDatabase} > ${pathToTmpOutput}`, (error, stdout, stderr) => {
      if (error) console.error(error)
    })
    fs.renameSync(pathToTmpOutput,pathToOutput)
    const { size: oldSize } = fs.statSync(pathToDatabase)
    const { size: newSize, ctime: created } = fs.statSync(pathToOutput)
    console.log(`Created ${path.basename(pathToOutput)} (${byteSize(newSize)}), saved ${byteSize(oldSize - newSize)}`)
    console.timeEnd(`Compressed ${path.basename(pathToDatabase)}`)
    try {
      backupDownloadManifest[path.basename(pathToDatabase)] = {
        name: path.basename(pathToDatabase),
        url: `https://downloads.ardent-industry.com/${path.basename(pathToOutput)}`,
        size: newSize,
        created,
        sha256: await getFileHash(pathToOutput)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Update list of compressed backups avalible for download
  fs.writeFileSync(pathToBackupDownloadManifest, JSON.stringify(backupDownloadManifest, null, 2))
  console.log(`Saved backup download manifest to ${pathToBackupDownloadManifest}`)

  console.timeEnd('Compressed backups')

  process.exit()
})()