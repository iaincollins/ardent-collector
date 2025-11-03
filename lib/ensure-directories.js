const fs = require('fs')
const path = require('path')

/**
 * Ensures that required directories exist for the application
 * Creates them if they don't exist
 */
function ensureDirectoriesExist () {
  const {
    ARDENT_DATA_DIR,
    ARDENT_CACHE_DIR,
    ARDENT_BACKUP_DIR,
    ARDENT_DOWNLOADS_DIR
  } = require('./consts')

  const requiredDirectories = [
    ARDENT_DATA_DIR,
    ARDENT_CACHE_DIR,
    ARDENT_BACKUP_DIR,
    ARDENT_DOWNLOADS_DIR
  ]

  for (const dir of requiredDirectories) {
    try {
      if (!fs.existsSync(dir)) {
        console.log(`Creating directory: ${dir}`)
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error.message)
      // Don't throw, let the application continue and fail gracefully later
    }
  }
}

module.exports = {
  ensureDirectoriesExist
}