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
        
        // Try to create with recursive option first
        fs.mkdirSync(dir, { recursive: true })
        
        // Verify creation was successful
        if (!fs.existsSync(dir)) {
          throw new Error(`Directory creation failed: ${dir}`)
        }
        
        console.log(`Successfully created directory: ${dir}`)
      }
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error.message)
      
      // Try alternative approach for container environments
      try {
        // Create relative to current working directory instead
        const fallbackDir = path.resolve(process.cwd(), path.basename(dir))
        
        if (!fs.existsSync(fallbackDir)) {
          console.log(`Trying fallback directory: ${fallbackDir}`)
          fs.mkdirSync(fallbackDir, { recursive: true })
          console.log(`Created fallback directory: ${fallbackDir}`)
        }
      } catch (fallbackError) {
        console.error(`Fallback directory creation also failed:`, fallbackError.message)
        console.log(`The application may not function correctly without directory: ${dir}`)
      }
    }
  }
}

module.exports = {
  ensureDirectoriesExist
}