import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Icon, type IconName } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { Motion } from '@/theme/motion';
import { timeLeft } from '@/lib/format';
import { togglePlay } from '@/player/controller';
import { useNowPlaying } from '@/player/use-now-playing';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

export const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Podcasts', icon: 'squares-four' },
  { name: 'up-next', title: 'Up Next', icon: 'queue' },
  { name: 'playlists', title: 'Playlists', icon: 'playlist' },
  { name: 'discover', title: 'Discover', icon: 'compass' },
  { name: 'settings', title: 'Settings', icon: 'gear' },
];

const BAR_HEIGHT = 62;
const MINI_HEIGHT = 58;

/** Room to leave at the bottom of a tab screen so its last row scrolls clear of the bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  const nowPlaying = useNowPlaying();
  return insets.bottom + BAR_HEIGHT + Spacing.three + (nowPlaying ? MINI_HEIGHT + Spacing.two : 0);
}

export type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: object) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  position: Animated.AnimatedInterpolation<number>;
};

function MiniPlayer() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const episode = useNowPlaying();
  const player = usePlayerState();
  if (!episode) return null;
  const current = player.id === String(episode.id);
  const positionS = current ? player.positionMs / 1000 : episode.position_s;
  const durationS =
    (current && player.durationMs ? player.durationMs / 1000 : null) ?? episode.duration_s;
  const progress = durationS ? Math.min(1, positionS / durationS) : 0;
  const playing = current && player.playWhenReady;
  return (
    <Reanimated.View entering={Motion.rise} exiting={Motion.sink}>
      <Pressable
        onPress={() => router.push('/player')}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${episode.title}. Opens the player.`}
        style={[
          styles.mini,
          {
            backgroundColor: theme.miniPlayer,
            borderColor: theme.dark ? theme.cardBorder : 'transparent',
          },
        ]}>
        <Artwork
          uri={episode.artwork_url ?? episode.podcast_artwork}
          title={episode.podcast_title}
          size={40}
          radius={8}
        />
        <View style={styles.miniText}>
          <Txt variant="bodyBold" color={theme.miniPlayerText} numberOfLines={1}>
            {episode.title}
          </Txt>
          <Txt
            variant="small"
            color={theme.miniPlayerText}
            style={{ opacity: 0.65 }}
            numberOfLines={1}>
            {[episode.podcast_title, timeLeft(positionS, durationS)].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <Pressable
          onPress={() => void togglePlay(db)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={styles.miniButton}>
          <Icon
            name={playing ? 'pause-fill' : 'play-fill'}
            size={26}
            color={theme.miniPlayerText}
          />
        </Pressable>
        <View style={[styles.miniTrack, { backgroundColor: theme.miniPlayerText }]} />
        <View
          style={[styles.miniFill, { width: `${progress * 92}%`, backgroundColor: theme.accent }]}
        />
      </Pressable>
    </Reanimated.View>
  );
}

/**
 * The bottom of every tab: the mini player above the tab bar. The selected pill follows the
 * pager while you swipe, so it glides between tabs rather than jumping.
 */
export function TabBar({ state, navigation, position }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slot = width / TABS.length;
  const translateX = position.interpolate({
    inputRange: TABS.map((_, i) => i),
    outputRange: TABS.map((_, i) => i * slot),
  });
  const floating = theme.floatingTabBar;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.miniWrap}>
        <MiniPlayer />
      </View>
      {/* Rebuilt when the theme changes: switching between the floating and flat bar in place
          left Android drawing an empty bar. */}
      <View
        key={theme.name}
        style={[
          floating
            ? [
                styles.floating,
                { marginBottom: insets.bottom + Spacing.two, borderColor: theme.tabBarBorder },
              ]
            : [styles.flat, { paddingBottom: insets.bottom, borderTopColor: theme.tabBarBorder }],
          { backgroundColor: theme.tabBar },
        ]}>
        <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && theme.tabSelected !== 'transparent' && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.bubble,
                {
                  width: slot - 12,
                  backgroundColor: theme.tabSelected,
                  transform: [{ translateX }],
                },
              ]}
            />
          )}
          {state.routes.map((route, index) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const focused = state.index === index;
            const color = focused ? theme.tabActive : theme.textSecondary;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.title}
                style={styles.item}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}>
                <Icon name={tab.icon} size={22} color={color} />
                <Txt variant="meta" color={color} style={styles.label}>
                  {tab.title}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  miniWrap: { paddingHorizontal: Spacing.two + 4, paddingBottom: Spacing.two },
  mini: {
    height: MINI_HEIGHT,
    borderRadius: Radius.medium + 2,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    gap: 11,
    overflow: 'hidden',
  },
  miniText: { flex: 1 },
  miniButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  miniTrack: {
    position: 'absolute',
    left: '4%',
    right: '4%',
    bottom: 2,
    height: 2,
    borderRadius: 1,
    opacity: 0.18,
  },
  miniFill: { position: 'absolute', left: '4%', bottom: 2, height: 2, borderRadius: 1 },
  floating: {
    marginHorizontal: Spacing.three,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flat: { borderTopWidth: StyleSheet.hairlineWidth },
  bar: { height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center' },
  bubble: { position: 'absolute', left: 6, top: 6, bottom: 6, borderRadius: (BAR_HEIGHT - 12) / 2 },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { textTransform: 'none', letterSpacing: 0, fontSize: 11 },
});
