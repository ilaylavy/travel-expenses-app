import { useIsRTL } from './useIsRTL';
import { useTranslation } from 'react-i18next';

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}));

describe('useIsRTL', () => {
  it('returns true when dir is rtl', () => {
    (useTranslation as jest.Mock).mockReturnValue({
      i18n: { dir: () => 'rtl' },
    });
    expect(useIsRTL()).toBe(true);
  });

  it('returns false when dir is ltr', () => {
    (useTranslation as jest.Mock).mockReturnValue({
      i18n: { dir: () => 'ltr' },
    });
    expect(useIsRTL()).toBe(false);
  });

  it('returns false when dir is undefined or unexpected', () => {
    (useTranslation as jest.Mock).mockReturnValue({
      i18n: { dir: () => undefined },
    });
    expect(useIsRTL()).toBe(false);
  });
});
