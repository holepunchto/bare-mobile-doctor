import * as FileSystem from 'expo-file-system';

const useBareDirectory = async (): Promise<string> => {
  const bareDir = FileSystem.documentDirectory + 'bare-doctor';

  try {
    await FileSystem.makeDirectoryAsync(bareDir, { intermediates: true });
    console.log('Directory created:', bareDir);
    return bareDir.replace('file://', ''); // Remove the URI prefix for compatibility with Bare
  } catch (error) {
    console.error('Error creating directory:', error);
    throw error;
  }
};

export default useBareDirectory;
