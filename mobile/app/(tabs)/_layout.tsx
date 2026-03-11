import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="log" options={{ title: 'Log' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: null,
        }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
