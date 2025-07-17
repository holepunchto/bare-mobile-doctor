import { useEffect, useState } from 'react'
import * as FileSystem from 'expo-file-system'

const useBareDirectory = () => {
  const [bareDir, setBareDir] = useState('')

  useEffect(() => {
    const createDirectory = async () => {
      try {
        const path = FileSystem.documentDirectory + 'bare-doctor'
        await FileSystem.makeDirectoryAsync(path, { intermediates: true })
        console.log('Directory created:', path)

        // Remove the URI prefix for compatibility with Bare
        setBareDir(path.replace('file://', ''))
      } catch (error) {
        console.error('Error creating directory:', error)
        throw error
      }
    }

    createDirectory()
  }, [])

  return bareDir
}

export default useBareDirectory
