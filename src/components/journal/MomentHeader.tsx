// The pill that hangs off the spine and bookmarks a Moment on the day's
// timeline. Glyph + title + time range + member-count badge + chevron.
// Title taps open the MomentOptionsSheet (rename / cover / split / delete);
// chevron taps collapse/expand the Moment's member list.
//
// Spine: the row owns its own thick spine slice plus a horizontal branch
// stub from the spine to the pill's inline-start edge — together these
// visibly anchor the pill to the spine instead of letting it float beside.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

import { NODE_COLUMN_WIDTH } from './spineGeometry';
import { SpineBranch, SpineSlice } from './SpineSlice';

// Vertical anchor inside the pill row, used to align the horizontal
// branch and (when capped) to truncate the spine slice. The pill is a
// flex row with alignItems: 'center'; its height is driven by the tallest
// child. Candidates:
//   - glyphDisc:   22px (fixed)
//   - titleCol:    title 14px + range 11px + marginTop 1 ≈ 30px at default RN line-height
//   - countBadge:  20px
//   - chev text:   ~16px
// titleCol dominates, so pill row ≈ paddingVertical(8) + titleCol(~30) +
// paddingVertical(8) ≈ 46px; center ≈ 23. Rounded to 22 because RN
// line-height rendering tends to come in a hair under nominal.
//
// This is a hand-computed value, not a measured one. If the pill's
// content geometry changes (title font size, range removal, larger disc),
// re-derive — or replace this with an onLayout measurement.
const PILL_CENTER_Y = 22;

interface Props {
  moment: JournalMoment;
  startsAt: string;
  endsAt: string;
  memberCount: number;
  collapsed: boolean;
  onPress: () => void;
  onToggleCollapse: () => void;
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
}

export function MomentHeader({
  moment,
  startsAt,
  endsAt,
  memberCount,
  collapsed,
  onPress,
  onToggleCollapse,
  spineCapTop = false,
  spineCapBottom = false,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const title = moment.title ?? t('journal.untitledMoment');
  const range = `${shortTime(startsAt)} – ${shortTime(endsAt)}`;

  return (
    <View style={styles.row}>
      {/* Gutter holds the thick spine slice + horizontal branch. The slice
          extends the full row height so it connects to the slices above
          and below; the branch sits at PILL_CENTER_Y and reaches into the
          pill. capTop/capBottom truncate the slice for first/last-row
          edge cases (collapsed moment as the only section, etc.). */}
      <View style={styles.gutter}>
        <SpineSlice
          thickness="thick"
          capTop={spineCapTop}
          capBottom={spineCapBottom}
          dotCenterY={PILL_CENTER_Y}
        />
        <SpineBranch thickness="thick" anchorY={PILL_CENTER_Y} length={18} />
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: theme.accentSoft,
            borderColor: theme.accent,
          },
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.glyphDisc, { backgroundColor: theme.accent }]}>
          <Text style={styles.glyph}>✦</Text>
        </View>
        <View style={styles.titleCol}>
          <Text
            style={[
              styles.title,
              {
                color: moment.title ? theme.text : theme.textMuted,
                fontStyle: moment.title ? 'normal' : 'italic',
              },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[styles.range, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            {range}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.countText}>{memberCount}</Text>
        </View>
        <Pressable
          onPress={onToggleCollapse}
          hitSlop={10}
          style={styles.chev}
        >
          <Text style={[styles.chevText, { color: theme.accent }]}>
            {collapsed ? '▸' : '▾'}
          </Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // paddingBottom (not marginBottom) so the gutter — which stretches to
    // row height — extends through the gap. The thick spine slice inside
    // the gutter therefore reaches the top of the first member row below
    // without a visible discontinuity.
    paddingBottom: 6,
  },
  gutter: {
    width: NODE_COLUMN_WIDTH,
    alignSelf: 'stretch',
    position: 'relative',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    marginInlineEnd: 12,
  },
  glyphDisc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { color: '#fff', fontSize: 12, fontWeight: '800' },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  range: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  chev: { paddingHorizontal: 4 },
  chevText: { fontSize: 14, fontWeight: '800' },
});
