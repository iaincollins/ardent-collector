const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const crypto = require('crypto')
const byteSize = require('byte-size')

const { ARDENT_BACKUP_DIR } = require('../lib/consts')

const pathToLocationsDbBackup = path.join(ARDENT_BACKUP_DIR, '/locations.db')
const pathToTradeDbBackup = path.join(ARDENT_BACKUP_DIR, '/trade.db')
const pathToStationsDbBackup = path.join(ARDENT_BACKUP_DIR, '/stations.db')
const pathToSystemsDbBackup = path.join(ARDENT_BACKUP_DIR, '/systems.db')

async function getFileHash (pathToFile) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const rs = fs.createReadStream(pathToFile)
    rs.on('error', reject)
    rs.on('data', chunk => hash.update(chunk))
    rs.on('end', () => resolve(hash.digest('hex')))
  })
 }

 ;(async () => {
  console.log('Compressing backups …')
  console.time('Compressed backups')
  const compressedBackups = {}

  const databasesToBackup = [
    pathToLocationsDbBackup,
    pathToTradeDbBackup,
    pathToStationsDbBackup,
    pathToSystemsDbBackup
  ]

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
      compressedBackups[path.basename(pathToDatabase)] = {
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
  fs.writeFileSync(path.join(ARDENT_BACKUP_DIR, 'backup-downloads.json'), JSON.stringify(compressedBackups, null, 2))

  console.timeEnd('Compressed backups')

  process.exit()
})()