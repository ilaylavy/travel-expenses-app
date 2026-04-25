import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

function TabEmoji({ emoji, focused, color }: { emoji: string; focused: boolean; color: string }) {
  return (
    <Text
      style={{
        fontSize: 22,
        opacity: focused ? 1 : 0.55,
        color,
      }}
    >
      {emoji}
    </Text>
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
        tabBarInactiveTintColor: theme.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tripView.tabExpenses'),
          tabBarIcon: ({ focused, color }) => (
            <TabEmoji emoji="📋" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tripView.tabMap'),
          tabBarIcon: ({ focused, color }) => (
            <TabEmoji emoji="📍" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: t('tripView.tabAsk'),
          tabBarIcon: ({ focused, color }) => (
            <TabEmoji emoji="🧠" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tripView.tabStats'),
          tabBarIcon: ({ focused, color }) => (
            <TabEmoji emoji="📊" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
