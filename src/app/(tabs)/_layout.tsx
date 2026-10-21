import TopTabs from 'expo-router/js-top-tabs';
import { useEffect, useState } from 'react';

import { Background } from '@/components/background';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TABS, TabsBridge, type TabBarProps } from '@/components/tab-bar';

const ALL_TABS_AFTER_MS = 3000;

/**
 * Tabs built on a pager, so they slide when tapped and can be swiped between. The tab bar and
 * mini player are drawn at the root (GlobalTabBar) so they stay on screen over every page.
 */
export default function TabsLayout() {
  // Only the tabs beside the current one are drawn at first, so opening stays quick; a moment
  // later all of them are, so tapping a tab further along is as quick as swiping to the next.
  const [preload, setPreload] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => setPreload(TABS.length - 1), ALL_TABS_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <Background />
      <TopTabs
        tabBarPosition="bottom"
        tabBar={(props: TabBarProps) => <TabsBridge {...props} />}
        screenOptions={{
          sceneStyle: { backgroundColor: 'transparent' },
          lazy: true,
          lazyPreloadDistance: preload,
        }}>
        {TABS.map((tab) => (
          <TopTabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
      </TopTabs>
      <StatusBarScrim />
    </>
  );
}
