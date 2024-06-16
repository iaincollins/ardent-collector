const fs = require('fs')
const { mkdir, rm, rmdir } = require('fs/promises')
const { Readable } = require('stream')
const { finished } = require('stream/promises')
const path = require('path')
const byteSize = require('byte-size')

const { ARDENT_DATA_DIR } = require('../lib/consts')
const TMP_DOWNLOAD_DIR = path.join(ARDENT_DATA_DIR, 'tmp')
const BASE_URL = 'https://downloads.ardent-industry.com/'
const FILES = [
  'systems.db',
  'trade.db',
  'stations.db',
  'locations.db'
]

async function download (url, destination) {
  if (fs.existsSync(destination)) await rm(destination)
  const res = await fetch(url)
  const fileStream = fs.createWriteStream(destination, { flags: 'wx' })
  await finished(Readable.fromWeb(res.body).pipe(fileStream))
}

function saveDownload (copyFrom, copyTo) {
  fs.rmSync(copyTo, { force: true })
  fs.rmSync(`${copyTo}-journal}`, { force: true })
  fs.rmSync(`${copyTo}-shm`, { force: true })
  fs.rmSync(`${copyTo}-wal`, { force: true })
  fs.renameSync(copyFrom, copyTo)
}

(async () => {
  if (!fs.existsSync(ARDENT_DATA_DIR)) await mkdir(ARDENT_DATA_DIR)
  if (!fs.existsSync(TMP_DOWNLOAD_DIR)) await mkdir(TMP_DOWNLOAD_DIR)

  for (const fileName of FILES) {
    const downloadDestination = path.resolve(TMP_DOWNLOAD_DIR, fileName)
    const saveDestination = path.resolve(ARDENT_DATA_DIR, fileName)
    const url = `${BASE_URL}${fileName}`
    console.log(`Downloading ${url} …`)
    await download(url, downloadDestination)
    const stats = fs.statSync(downloadDestination)
    console.log(`  * Download of ${fileName} complete (${(byteSize(stats.size))})`)
    saveDownload(downloadDestination, saveDestination)
    console.log(`  * Saved to ${saveDestination}`)
  }

  rmdir(TMP_DOWNLOAD_DIR)
})()
