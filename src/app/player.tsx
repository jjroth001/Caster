import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Background } from '@/components/background';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { IconButton } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { Scrubber } from '@/components/scrubber';
import { SkipButton } from '@/components/skip-button';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { clock, speedLabel } from '@/lib/format';
import { setStopAtEndOfEpisode, togglePlay, useStopAtEndOfEpisode } from '@/player/controller';
import { engine, type TrimSilence } from '@/player/engine';
import { useNowPlaying } from '@/player/use-now-playing';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const SPEEDS = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3];
const TRIM_LABELS: Record<TrimSilence, string> = { off: 'Off', mild: 'Mild', aggressive: 'Strong' };
const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60];

function Control({
  icon,
  label,
  value,
  active,
  onPress,
  text,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  active?: boolean;
  onPress: () => void;
  text?: string;
}) {
  const theme = useTheme();
  const color = active ? theme.accent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.control, pressed && { opacity: 0.6 }]}>
      <View style={[styles.controlCircle, { backgroundColor: theme.element }]}>
        {text ? (
          <Txt variant="smallBold" color={color} style={styles.controlText}>
            {text}
          </Txt>
        ) : (
          icon && <Icon name={icon} size={22} color={color} />
        )}
      </View>
      <Txt variant="small" secondary numberOfLines={1} style={styles.controlLabel}>
        {value ?? label}
      </Txt>
    </Pressable>
  );
}

export default function PlayerScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const episode = useNowPlaying();
  const player = usePlayerState();
  const settingsQuery = useSettings();
  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const stopAtEnd = useStopAtEndOfEpisode();

  // Nothing left to play (Up Next ran out): close.
  const finished = settingsQuery.status === 'success' && settings.nowPlaying === null;
  useEffect(() => {
    if (finished && router.canGoBack()) router.back();
  }, [finished]);

  if (!episode) return <Background />;

  const current = player.id === String(episode.id);
  const playing = current && player.playWhenReady;
  const positionMs = current ? player.positionMs : episode.position_s * 1000;
  const durationMs =
    (current ? player.durationMs : null) ?? (episode.duration_s ? episode.duration_s * 1000 : null);
  const basic = engine.kind === 'basic';
  const art = Math.min(width - Spacing.five * 2, height * 0.4);
  const sleepLeft = player.sleepRemainingMs;

  const chooseSpeed = () => {
    Alert.alert(
      'Playback speed',
      undefined,
      [
        ...SPEEDS.filter((s) => !basic || s <= 2).map((s) => ({
          text: `${speedLabel(s)}${Math.abs(player.speed - s) < 0.01 ? '  ✓' : ''}`,
          onPress: () => {
            void engine.setSpeed(s);
            void setSetting('speed', s);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  const cycleTrim = () => {
    const order: TrimSilence[] = ['off', 'mild', 'aggressive'];
    const next = order[(order.indexOf(settings.trimSilence) + 1) % order.length];
    void engine.setTrimSilence(next);
    void setSetting('trimSilence', next);
  };

  const toggleBoost = () => {
    void engine.setVolumeBoost(!settings.volumeBoost);
    void setSetting('volumeBoost', !settings.volumeBoost);
  };

  const chooseSleep = () => {
    const on = sleepLeft != null || stopAtEnd;
    Alert.alert(
      'Sleep timer',
      on ? 'Playback will pause on its own.' : 'Pause playback after…',
      [
        ...(on
          ? [
              {
                text: 'Turn off',
                style: 'destructive' as const,
                onPress: () => {
                  void engine.setSleepTimer(0);
                  setStopAtEndOfEpisode(false);
                },
              },
            ]
          : []),
        ...SLEEP_MINUTES.map((m) => ({
          text: `${m} minutes`,
          onPress: () => {
            setStopAtEndOfEpisode(false);
            void engine.setSleepTimer(m * 60_000);
          },
        })),
        {
          text: 'End of episode',
          onPress: () => {
            void engine.setSleepTimer(0);
            setStopAtEndOfEpisode(true);
          },
        },
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  };

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.four },
        ]}>
        <View style={styles.topBar}>
          <IconButton icon="caret-down" label="Close player" onPress={() => router.back()} />
          <Txt variant="meta" secondary style={styles.topTitle}>
            Now playing
          </Txt>
          <IconButton
            icon="dots-three-vertical"
            label="Episode details"
            onPress={() => router.push(`/episode/${episode.id}`)}
          />
        </View>

        <Artwork
          uri={episode.artwork_url ?? episode.podcast_artwork}
          title={episode.podcast_title}
          size={art}
          radius={22}
          style={styles.art}
        />

        <View style={styles.titles}>
          <Txt variant="heading" style={styles.center} numberOfLines={2}>
            {episode.title}
          </Txt>
          <Pressable
            onPress={() => router.push(`/podcast/${episode.podcast_id}`)}
            accessibilityRole="link">
            <Txt secondary style={styles.center} numberOfLines={1}>
              {episode.podcast_title}
            </Txt>
          </Pressable>
        </View>

        <Scrubber
          positionMs={positionMs}
          durationMs={durationMs}
          bufferedMs={current ? player.bufferedMs : 0}
          onSeek={(ms) => void engine.seekTo(ms)}
        />

        <View style={styles.transport}>
          <SkipButton seconds={settings.skipBackS} onPress={() => void engine.skipBack()} />
          <Pressable
            onPress={() => void togglePlay(db)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            style={({ pressed }) => [
              styles.play,
              { backgroundColor: theme.accent },
              pressed && { opacity: 0.8 },
            ]}>
            <View style={!playing && { marginLeft: 4 }}>
              <Icon name={playing ? 'pause-fill' : 'play-fill'} size={36} color={theme.onAccent} />
            </View>
          </Pressable>
          <SkipButton
            seconds={settings.skipForwardS}
            forward
            onPress={() => void engine.skipForward()}
          />
        </View>
        {current && player.state === 'buffering' && (
          <Txt variant="small" secondary style={styles.center}>
            Loading…
          </Txt>
        )}

        <View style={styles.controls}>
          <Control
            label="Speed"
            text={speedLabel(player.speed)}
            active={player.speed !== 1}
            onPress={chooseSpeed}
          />
          {!basic && (
            <Control
              icon="waveform"
              label="Trim silence"
              value={
                settings.trimSilence === 'off'
                  ? 'Trim silence'
                  : `Trim: ${TRIM_LABELS[settings.trimSilence]}`
              }
              active={settings.trimSilence !== 'off'}
              onPress={cycleTrim}
            />
          )}
          {!basic && (
            <Control
              icon="speaker-high"
              label="Volume boost"
              value={settings.volumeBoost ? 'Boost on' : 'Boost'}
              active={settings.volumeBoost}
              onPress={toggleBoost}
            />
          )}
          <Control
            icon="moon"
            label="Sleep timer"
            value={stopAtEnd ? 'End of ep.' : sleepLeft != null ? clock(sleepLeft) : 'Sleep'}
            active={stopAtEnd || sleepLeft != null}
            onPress={chooseSleep}
          />
        </View>

        <Pressable
          onPress={() => {
            router.back();
            router.navigate('/up-next');
          }}
          accessibilityRole="button"
          style={[styles.upNext, { backgroundColor: theme.element }]}>
          <Icon name="queue" size={18} color={theme.text} />
          <Txt variant="smallBold">Up Next</Txt>
        </Pressable>
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  topBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -Spacing.three },
  topTitle: { flex: 1, textAlign: 'center' },
  art: { alignSelf: 'center', marginTop: Spacing.two },
  titles: { gap: 4, marginTop: Spacing.two },
  center: { textAlign: 'center' },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five + 4,
  },
  play: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.two },
  control: { alignItems: 'center', gap: 6, width: 76 },
  controlCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { fontSize: 14 },
  controlLabel: { textAlign: 'center' },
  upNext: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    marginTop: Spacing.two,
  },
});
