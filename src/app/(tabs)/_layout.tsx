import TopTabs from 'expo-router/js-top-tabs';

import { Background } from '@/components/background';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TABS, TabsBridge, type TabBarProps } from '@/components/tab-bar';

/**
 * Tabs built on a pager, so they slide when tapped and can be swiped between. The tab bar and
 * mini player are drawn at the root (GlobalTabBar) so they stay on screen over every page.
 */
export default function TabsLayout() {
  return (
    <>
      <Background />
      <TopTabs
        tabBarPosition="bottom"
        tabBar={(props: TabBarProps) => <TabsBridge {...props} />}
        screenOptions={{
          sceneStyle: { backgroundColor: 'transparent' },
          // Tabs draw when first needed, but the ones beside the current tab are made ready
          // in advance, so swiping or tapping to them never shows an empty page.
          lazy: true,
          lazyPreloadDistance: 1,
        }}>
        {TABS.map((tab) => (
          <TopTabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
      </TopTabs>
      <StatusBarScrim />
    </>
  );
}
