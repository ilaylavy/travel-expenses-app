import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
}

// Launch the system camera. Returns null when the user cancels or denies
// permission so the caller can just carry on without a photo.
export async function capturePhoto(): Promise<PickedPhoto | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return null;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return { uri: result.assets[0].uri };
  } catch (error) {
    console.warn('Camera failed:', error);
    return null;
  }
}

// Pick one or more photos from the photo library. Returns [] when the user
// cancels — never throws back to the caller.
export async function pickPhotosFromLibrary(): Promise<PickedPhoto[]> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return [];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
      exif: false,
    });
    if (result.canceled) return [];
    return result.assets.map((asset) => ({ uri: asset.uri }));
  } catch (error) {
    console.warn('Gallery pick failed:', error);
    return [];
  }
}
