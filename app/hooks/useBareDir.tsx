import { Directory, Paths } from 'expo-file-system'

const useBareDirectory = (): string => {
  const dir = new Directory(Paths.document, 'bare-doctor')
  if (!dir.exists) {
    dir.create()
  }
  return dir.uri.replace('file://', '')
}

export default useBareDirectory
