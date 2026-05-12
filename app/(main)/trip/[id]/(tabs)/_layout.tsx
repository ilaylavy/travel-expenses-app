import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

function TabEmoji({ emoji, focused }: { emoji: string; focused: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.iconWrap,
        focused && { backgroundColor: theme.accentSoft },
      ]}
    >
      <Text
        style={[
          styles.emoji,
          { opacity: focused ? 1 : 0.45 },
        ]}
      >
        {emoji}
      </Text>
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
        tabBarItemStyle: { paddingTop: 4 },
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

const styles = StyleSheet.create({
  iconWrap: {
    paddingHorizontal: spacing.md + 2, // 12 — pill width around the emoji
    paddingVertical: 4,
    borderRadius: sizing.radiusPill,
  },
  emoji: {
    fontSize: 20,
    lineHeight: 22,
  },
});
