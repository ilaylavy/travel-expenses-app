import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
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
        <Text style={[styles.emoji, { opacity: focused ? 1 : 0.45 }]}>{emoji}</Text>
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
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tripView.tabMap'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📍" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: t('tripView.tabAsk'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="🧠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tripView.tabStats'),
          tabBarIcon: ({ focused }) => <TabEmoji emoji="📊" focused={focused} />,
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
  emoji: {
    fontSize: 20,
    lineHeight: 24, // generous so emoji glyph (with descenders) never clips
  },
});
