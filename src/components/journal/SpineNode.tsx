// One node on the timeline spine. Renders a fixed-width column containing:
// the dot itself (solo = filled accent / member = hollow ring), a 3-row label
// stack (time, optional "by name" attribution, optional check icon for
// selection mode), and an enlarged ~44pt touch target that initiates drag
// on long-press. The row body stays free to handle taps for content actions.
//
// Geometry: NODE_COLUMN_WIDTH is the only width any caller should care about.
// Time is rendered in small-caps tabular weight so the column reads as a
// vertical column of timestamps when several rows stack.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { SpineSlice } from './SpineSlice';
import { NODE_COLUMN_WIDTH } from './spineGeometry';

const DOT_FILLED = 9;
const DOT_HOLLOW = 8;

interface Props {
  occurredAt: string;
  loggedByName?: string | null;
  variant: 'solo' | 'member';
  onDragStart?: () => void;
  // Selection-mode affordance (Phase 7+): show a check tick instead of /
  // alongside the time label. The host wires the tap on the row body to
  // toggle this state.
  selectable?: boolean;
  selected?: boolean;
  // Per-row spine parameters. The owning row decides these based on its
  // position in the section list (first / last) and whether it's inside a
  // Moment (thick).
  spineThickness?: 'thin' | 'thick';
  spineCapTop?: boolean;
  spineCapBottom?: boolean;
}

export function SpineNode({
  occurredAt,
  loggedByName,
  variant,
  onDragStart,
  selectable,
  selected,
  spineThickness = 'thin',
  spineCapTop = false,
  spineCapBottom = false,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const time = formatTime(occurredAt);

  const dotStyle =
    variant === 'solo'
      ? {
          width: DOT_FILLED,
          height: DOT_FILLED,
          borderRadius: DOT_FILLED / 2,
          backgroundColor: theme.accent,
          shadowColor: theme.accent,
          shadowOpacity: 0.5,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }
      : {
          width: DOT_HOLLOW,
          height: DOT_HOLLOW,
          borderRadius: DOT_HOLLOW / 2,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: theme.accent,
        };

  return (
    <Pressable
      onLongPress={onDragStart}
      hitSlop={8}
      delayLongPress={300}
      accessibilityLabel={onDragStart ? t('journal.dragToReorder') : undefined}
      style={styles.root}
    >
      <SpineSlice
        thickness={spineThickness}
        capTop={spineCapTop}
        capBottom={spineCapBottom}
      />
      <View style={styles.dotWrap}>
        <View style={[styles.dot, dotStyle]} />
        {selectable ? (
          <View
            style={[
              styles.checkRing,
              {
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? theme.accent : theme.bg,
              },
            ]}
          >
            {selected ? <Text style={styles.checkGlyph}>✓</Text> : null}
          </View>
        ) : null}
      </View>
      <Text
        style={[
          styles.time,
          { color: variant === 'solo' ? theme.text : theme.textSecondary },
        ]}
      >
        {time}
      </Text>
      {loggedByName ? (
        <Text
          style={[styles.by, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {t('journal.loggedBy', { name: loggedByName })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function formatTime(iso: string): string {
  // Inputs:
  //   - "YYYY-MM-DDTHH:MM(:SS)?(Z|±HH:MM)?" — from photo entries/voice clips
  //   - "YYYY-MM-DDTHH:MM:SS"               — from expenses (local wall-clock)
  // Bare local wall-clock has no timezone, so we want to keep "13:42" as-is
  // rather than letting Date apply the device timezone twice.
  let d: Date;
  if (/T\d{2}:\d{2}(:\d{2})?$/.test(iso)) {
    d = new Date(iso);
  } else if (iso.length === 16) {
    d = new Date(`${iso}:00`);
  } else {
    d = new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: {
    width: NODE_COLUMN_WIDTH,
    alignItems: 'center',
    paddingTop: 8,
    alignSelf: 'stretch',
    position: 'relative',
  },
  dotWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  dot: {
    elevation: 2,
  },
  checkRing: {
    position: 'absolute',
    top: -2,
    right: -10,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  time: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  by: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    maxWidth: NODE_COLUMN_WIDTH,
    textAlign: 'center',
  },
});
