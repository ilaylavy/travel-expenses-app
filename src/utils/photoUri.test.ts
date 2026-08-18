import { isWebViewableUri } from './photoUri';
import { Platform } from 'react-native';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
  },
}));

describe('isWebViewableUri', () => {
  describe('when Platform.OS is web', () => {
    beforeEach(() => {
      Platform.OS = 'web';
    });

    it('returns false for null/undefined/empty', () => {
      expect(isWebViewableUri(null)).toBe(false);
      expect(isWebViewableUri(undefined)).toBe(false);
      expect(isWebViewableUri('')).toBe(false);
    });

    it('returns true for viewable web URIs (https, blob, data)', () => {
      expect(isWebViewableUri('https://example.com/image.jpg')).toBe(true);
      expect(isWebViewableUri('blob:http://localhost/1234')).toBe(true);
      expect(isWebViewableUri('data:image/jpeg;base64,')).toBe(true);
    });

    it('returns false for unviewable web URIs (http, file, etc)', () => {
      expect(isWebViewableUri('http://example.com/image.jpg')).toBe(false);
      expect(isWebViewableUri('file:///path/to/image.jpg')).toBe(false);
      expect(isWebViewableUri('content://media/external/images/media/1')).toBe(false);
    });
  });

  describe('when Platform.OS is not web (native)', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it('returns false for null/undefined/empty', () => {
      expect(isWebViewableUri(null)).toBe(false);
      expect(isWebViewableUri(undefined)).toBe(false);
      expect(isWebViewableUri('')).toBe(false);
    });

    it('returns true for any string URI because native Image handles it', () => {
      expect(isWebViewableUri('file:///path/to/image.jpg')).toBe(true);
      expect(isWebViewableUri('content://media/external/images/media/1')).toBe(true);
      expect(isWebViewableUri('https://example.com/image.jpg')).toBe(true);
      expect(isWebViewableUri('http://example.com/image.jpg')).toBe(true);
    });
  });
});
