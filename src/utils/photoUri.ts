// Native devices upload photos and write the source file:// URI into
// expense_photos.local_uri. That value rides along through realtime to web
// clients pulling the same row, where it isn't a renderable URL — the
// browser can't read the device's filesystem. This helper checks whether a
// stored URI is something the current platform's <Image> can actually load,
// so PhotoThumb / PhotoGalleryModal can fall back to fetching a signed URL
// from Storage instead of trying to render a dangling file:// pointer.
//
// Native devices keep the existing behavior: file:// URIs are local-disk
// paths that React Native's <Image> handles natively, so they pass.
import { Platform } from 'react-native';

export function isWebViewableUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  if (Platform.OS !== 'web') return true;
  return uri.startsWith('https://') || uri.startsWith('blob:') || uri.startsWith('data:');
}
