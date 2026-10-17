import TopTabs from 'expo-router/js-top-tabs';

import { Background } from '@/components/background';
import { TABS, TabBar, type TabBarProps } from '@/components/tab-bar';

/**
 * Tabs built on a pager, so they slide when tapped and can be swiped between. The tab bar and
 * mini player float over the screens.
 */
export default function TabsLayout() {
  return (
    <>
      <Background />
      <TopTabs
        tabBarPosition="bottom"
        tabBar={(props: TabBarProps) => <TabBar {...props} />}
        screenOptions={{ sceneStyle: { backgroundColor: 'transparent' }, lazy: true }}>
        {TABS.map((tab) => (
          <TopTabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
        ))}
      </TopTabs>
    </>
  );
}
