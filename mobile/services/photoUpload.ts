import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCAL_PHOTO_KEY_PREFIX = 'baby_photo_uri_';

/**
 * Pick an image from the device's library.
 * Returns the local URI or null if cancelled.
 */
export async function pickBabyPhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[photoUpload] Media library permission not granted');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/**
 * Upload a baby photo to Supabase Storage.
 * Falls back to storing the local URI if Supabase Storage isn't configured.
 */
export async function uploadBabyPhoto(
  babyId: string,
  localUri: string
): Promise<string> {
  try {
    const ext = localUri.split('.').pop() || 'jpg';
    const fileName = `${babyId}/avatar.${ext}`;

    const response = await fetch(localUri);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from('baby-photos')
      .upload(fileName, blob, {
        upsert: true,
        contentType: `image/${ext}`,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('baby-photos')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;
    await AsyncStorage.setItem(`${LOCAL_PHOTO_KEY_PREFIX}${babyId}`, publicUrl);
    return publicUrl;
  } catch (err) {
    console.warn('[photoUpload] Supabase upload failed, storing locally:', err);
    await AsyncStorage.setItem(`${LOCAL_PHOTO_KEY_PREFIX}${babyId}`, localUri);
    return localUri;
  }
}

/**
 * Get the stored photo URI for a baby (from cache or Supabase).
 */
export async function getBabyPhotoUri(babyId: string): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(`${LOCAL_PHOTO_KEY_PREFIX}${babyId}`);
    return cached;
  } catch {
    return null;
  }
}
