// Floating bottom banner shown while the user is curating a new Moment.
// Anchored above the system gesture bar. Title + live count on the left;
// Cancel + Create on the right. Create is disabled at 0 selected.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  selectedCount: number;
  // 'create' → "Create Moment" CTA, disabled at 0 selected.
  // 'edit'   → "Save changes" CTA, always enabled (so the user can deselect
  //            everything → equivalent to deleting the Moment, which the
  //            caller handles via the add/remove diff path).
  mode: 'create' | 'edit';
  onCancel: () => void;
  onConfirm: () => void;
}

export function MomentSelectionBanner({
  selectedCount,
  mode,
  onCancel,
  onConfirm,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isCreate = mode === 'create';
  const canConfirm = isCreate ? selectedCount > 0 : true;
  const ctaLabel = isCreate
    ? t('journal.createMoment')
    : t('journal.momentSaveChanges');
  const bannerCopy = isCreate
    ? t('journal.momentSelectionBanner')
    : t('journal.momentSelectionBannerEdit');

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: theme.surfaceRaised,
          borderColor: theme.border,
          shadowColor: theme.accent,
        },
      ]}
    >
      <View style={styles.copyCol}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.glyphDisc, { backgroundColor: theme.accent }]}>
            <Text style={styles.glyph}>✦</Text>
          </View>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {bannerCopy}
          </Text>
        </View>
        <Text style={[styles.count, { color: theme.accent }]}>
          {t('journal.momentSelectionCount', { count: selectedCount })}
        </Text>
      </View>
      <Pressable
        onPress={onCancel}
        hitSlop={6}
        style={({ pressed }) => [
          styles.cancelBtn,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={[styles.cancelTxt, { color: theme.textMuted }]}>
          {t('common.cancel')}
        </Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={!canConfirm}
        style={({ pressed }) => [
          styles.createBtn,
          {
            backgroundColor: canConfirm ? theme.accent : theme.border,
            shadowColor: canConfirm ? theme.accent : 'transparent',
            shadowOpacity: canConfirm ? 0.4 : 0,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.createTxt}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    insetInlineStart: 16,
    insetInlineEnd: 16,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  copyCol: { flex: 1, minWidth: 0 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  glyphDisc: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#fff', fontSize: 10, fontWeight: '900' },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  count: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  cancelTxt: { fontSize: 12, fontWeight: '700' },
  createBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  createTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
