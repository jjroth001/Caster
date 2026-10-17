import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerCore } from '@modules/player-core/src';
import { VideoSurface } from '@modules/player-core/src/VideoSurface';
import { Icon, type IconName } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { clock } from '@/lib/format';
import { togglePlay } from '@/player/controller';
import { engine } from '@/player/engine';
import { usePlayerState } from '@/player/use-player';
import { Spacing } from '@/theme/themes';

/** How long the controls stay up after a tap. */
const CONTROLS_MS = 3500;
const WHITE = '#ffffff';

function RoundButton({
  icon,
  label,
  onPress,
  size = 26,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={size} color={WHITE} duotone={false} />
    </Pressable>
  );
}

/**
 * The playing episode's video, full screen. The phone may turn sideways here (the rest of
 * Caster stays upright), and leaving Caster while it plays shrinks it to a floating window.
 * Closing it keeps the episode playing as audio.
 */
export default function VideoScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const player = usePlayerState();
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const landscape = width > height;
  // In picture-in-picture Caster's window is tiny: show the video alone.
  const pip = width < 400 && height < 400;

  useEffect(() => {
    void PlayerCore?.setVideoScreenOpen(true);
    return () => {
      void PlayerCore?.setVideoScreenOpen(false);
    };
  }, []);

  useEffect(() => {
    void PlayerCore?.setImmersive(landscape && !pip);
  }, [landscape, pip]);

  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (controls && player.playing) {
      hideTimer.current = setTimeout(() => setControls(false), CONTROLS_MS);
    }
    return () => clearTimeout(hideTimer.current);
  }, [controls, player.playing]);

  const nudge = (action: () => void) => () => {
    action();
    setControls(true);
  };

  if (!VideoSurface) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Txt color={WHITE}>Video needs the installed app; it plays as audio here.</Txt>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setControls((c) => !c)}
        accessibilityLabel="Show or hide the controls">
        <VideoSurface style={StyleSheet.absoluteFill} />
      </Pressable>
      {controls && !pip && (
        <Reanimated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(220)}
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, styles.scrim]}>
          <View
            style={[
              styles.top,
              {
                paddingTop: (landscape ? Spacing.two : insets.top) + Spacing.two,
                paddingHorizontal: (landscape ? insets.left : 0) + Spacing.three,
              },
            ]}>
            <RoundButton icon="caret-down" label="Close video" onPress={() => router.back()} />
            <View style={styles.flexRow} />
            <RoundButton
              icon="picture-in-picture"
              label="Floating window"
              onPress={() => void PlayerCore?.enterPictureInPicture()}
            />
          </View>
          <View style={styles.middle} pointerEvents="box-none">
            <RoundButton
              icon="arrow-counter-clockwise"
              label="Skip back"
              size={34}
              onPress={nudge(() => void engine.skipBack())}
            />
            <Pressable
              onPress={nudge(() => void togglePlay(db))}
              accessibilityRole="button"
              accessibilityLabel={player.playWhenReady ? 'Pause' : 'Play'}
              style={({ pressed }) => [styles.play, pressed && { opacity: 0.7 }]}>
              <Icon
                name={player.playWhenReady ? 'pause-fill' : 'play-fill'}
                size={40}
                color={WHITE}
                duotone={false}
              />
            </Pressable>
            <RoundButton
              icon="arrow-clockwise"
              label="Skip forward"
              size={34}
              onPress={nudge(() => void engine.skipForward())}
            />
          </View>
          <View
            style={[
              styles.bottom,
              { paddingBottom: (landscape ? Spacing.two : insets.bottom) + Spacing.three },
            ]}>
            <Txt variant="smallBold" color={WHITE}>
              {clock(player.positionMs)}
              {player.durationMs ? ` / ${clock(player.durationMs)}` : ''}
            </Txt>
          </View>
        </Reanimated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  flexRow: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center' },
  middle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  bottom: { alignItems: 'center' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
