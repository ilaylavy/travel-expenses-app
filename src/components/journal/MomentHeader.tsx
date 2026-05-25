// The pill that hangs off the spine and bookmarks a Moment on the day's
// timeline. Glyph + title + time range + member-count badge + chevron.
// Title taps open the MomentOptionsSheet (rename / cover / split / delete);
// chevron taps collapse/expand the Moment's member list.
//
// Layout: a 64px gutter holds the spine in place behind the pill, then the
// pill itself fills the rest of the row. The gutter width matches NODE_COLUMN_WIDTH
// from SpineNode so the pill aligns flush with the row bodies below.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { JournalMoment } from '@/types/journal';

import { NODE_COLUMN_WIDTH } from './SpineNode';

interface Props {
  moment: JournalMoment;
  startsAt: string;
  endsAt: string;
  memberCount: number;
  collapsed: boolean;
  onPress: () => void;
  onToggleCollapse: () => void;
}

export function MomentHeader({
  moment,
  startsAt,
  endsAt,
  memberCount,
  collapsed,
  onPress,
  onToggleCollapse,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const title = moment.title ?? t('journal.untitledMoment');
  const range = `${shortTime(startsAt)} – ${shortTime(endsAt)}`;

  return (
    <View style={styles.row}>
      {/* Gutter reserves the spine x-position so the spine line runs cleanly
          behind the pill without the pill having to align to it manually. */}
      <View style={styles.gutter} />
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
        {/* Decorative ✦ in a tinted disc — feels like a chapter mark in
            an editorial album rather than a plain bullet. */}
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
    marginBottom: 6,
  },
  gutter: {
    width: NODE_COLUMN_WIDTH,
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
