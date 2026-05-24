import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  const theme = useTheme();
  // The active background is a square (width === height) with radiusPill so it
  // renders as a true circle, not a wide oval. iconBox is wider than the circle
  // to give the icon some horizontal slot room without stretching the circle.
  return (
    <View style={styles.iconBox}>
      <View
        style={[
          styles.circle,
          focused ? { backgroundColor: theme.accentSoft } : null,
        ]}
      >
        <Icon name={name} size={20} color={color} stroke={2} />
      </View>
    </View>
  );
}

export default function TripTabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
          borderTopWidth: borderWidth.hairline,
          // Floating-card top corners per design-system/components/bottom-nav.
          // RN clips children to these so we keep the inner padding moderate
          // and rely on the system safe-area inset for bottom breathing room.
          borderTopLeftRadius: sizing.radiusCardInner,
          borderTopRightRadius: sizing.radiusCardInner,
          overflow: 'hidden',
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tripView.tabExpenses'),
          tabBarIcon: ({ focused, color }) => <TabIcon name="list" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tripView.tabMap'),
          tabBarIcon: ({ focused, color }) => <TabIcon name="map-pin" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: t('journal.tabLabel'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📖" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: t('tripView.tabAsk'),
          tabBarIcon: ({ focused, color }) => <TabIcon name="sparkles" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tripView.tabStats'),
          tabBarIcon: ({ focused, color }) => <TabIcon name="bar-chart" focused={focused} color={color} />,
        }}
      />
    </Tabs>
  );
}

const CIRCLE = 30; // active-circle diameter; must fit the tab's icon slot
const SLOT_HEIGHT = 30; // hard-cap height so RN's overflow:hidden doesn't clip

const styles = StyleSheet.create({
  iconBox: {
    minWidth: 44,
    height: SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
