import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function SectionHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>{label}</Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {children}
    </View>
  );
}

export function Row({
  label,
  subtitle,
  right,
}: {
  label: string | ReactNode;
  subtitle?: string;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        {typeof label === 'string' ? (
          <Text style={[styles.labelText, { color: theme.text }]}>{label}</Text>
        ) : (
          label
        )}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentBtn,
              active && { backgroundColor: theme.accent },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? '#FFFFFF' : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: borderWidth.base,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowLabelWrap: { flex: 1, minWidth: 0 },
  rowRight: { flexShrink: 0 },
  labelText: { ...typography.body, fontWeight: '600' },
  subtitle: { ...typography.caption, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  segment: {
    flexDirection: 'row',
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: sizing.radiusButton - 2,
  },
  segmentText: { fontSize: 12, fontWeight: '700' },
});
