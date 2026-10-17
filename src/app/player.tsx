import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { engine, type TrimSilence } from '@/player/engine';
import { usePlayerError, usePlayerState } from '@/player/use-player';

/** Public-domain LibriVox recording (O. Henry, "The Green Door"), served via a redirect. */
const SAMPLE = {
  id: 'sample-green-door',
  url: 'https://archive.org/download/short_story_031_0807_librivox/shortstory031_greendoor_jl_64kb.mp3',
  title: 'The Green Door',
  artist: 'O. Henry · LibriVox',
  album: 'Short Story Collection Vol. 031',
};

const SPEEDS = [0.8, 1, 1.2, 1.5, 2, 2.5, 3];
const TRIM: TrimSilence[] = ['off', 'mild', 'aggressive'];

function clock(ms: number | null) {
  if (ms == null) return '--:--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Temporary screen for trying the player engine until the real player screen exists. */
export default function PlayerTestScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const state = usePlayerState();
  const error = usePlayerError();
  const [url, setUrl] = useState(SAMPLE.url);
  const [barWidth, setBarWidth] = useState(1);
  const basic = engine.kind === 'basic';

  const load = () => {
    const custom = url.trim() !== SAMPLE.url;
    void engine.load(
      custom ? { id: url.trim(), url: url.trim(), title: 'Test episode' } : { ...SAMPLE },
    );
  };
  const progress = state.durationMs ? Math.min(1, state.positionMs / state.durationMs) : 0;
  const buffered = state.durationMs ? Math.min(1, state.bufferedMs / state.durationMs) : 0;

  const chip = (label: string, selected: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.backgroundElement },
        disabled && styles.disabled,
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing.four,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      <ThemedText type="subtitle">Player test</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {basic
          ? 'Basic player (Expo Go): no trim silence, volume boost or background playback.'
          : 'Full player: plays in the background with notification and headset controls.'}
      </ThemedText>

      <TextInput
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Audio URL"
        placeholderTextColor={theme.textSecondary}
      />
      <Pressable onPress={load} style={[styles.button, { backgroundColor: theme.text }]}>
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          Load and play
        </ThemedText>
      </Pressable>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">
          {state.id ? (state.id === SAMPLE.id ? SAMPLE.title : 'Test episode') : 'Nothing loaded'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {state.state}
          {state.playing ? ' · playing' : ''}
        </ThemedText>
        <Pressable
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            if (state.durationMs)
              void engine.seekTo((e.nativeEvent.locationX / barWidth) * state.durationMs);
          }}
          style={styles.barHit}>
          <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${buffered * 100}%`,
                  backgroundColor: theme.textSecondary,
                  opacity: 0.35,
                },
              ]}
            />
            <View
              style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: theme.text }]}
            />
          </View>
        </Pressable>
        <View style={styles.row}>
          <ThemedText type="small">{clock(state.positionMs)}</ThemedText>
          <ThemedText type="small">{clock(state.durationMs)}</ThemedText>
        </View>
        <View style={styles.transport}>
          {chip('−10s', false, () => void engine.skipBack())}
          {chip(
            state.playWhenReady ? 'Pause' : 'Play',
            true,
            () => void (state.playWhenReady ? engine.pause() : engine.play()),
          )}
          {chip('+30s', false, () => void engine.skipForward())}
        </View>
      </View>

      <ThemedText type="smallBold">Speed</ThemedText>
      <View style={styles.wrap}>
        {SPEEDS.map((s) =>
          chip(
            `${s}×`,
            Math.abs(state.speed - s) < 0.01,
            () => void engine.setSpeed(s),
            basic && s > 2,
          ),
        )}
      </View>

      <ThemedText type="smallBold">Trim silence</ThemedText>
      <View style={styles.wrap}>
        {TRIM.map((t) =>
          chip(t, state.trimSilence === t, () => void engine.setTrimSilence(t), basic),
        )}
      </View>

      <ThemedText type="smallBold">Volume boost</ThemedText>
      <View style={styles.wrap}>
        {chip('Off', !state.volumeBoost, () => void engine.setVolumeBoost(false), basic)}
        {chip('On', state.volumeBoost, () => void engine.setVolumeBoost(true), basic)}
      </View>

      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  button: { borderRadius: 999, paddingVertical: Spacing.three, alignItems: 'center' },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  barHit: { paddingVertical: Spacing.two },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  transport: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  disabled: { opacity: 0.35 },
  error: { color: '#C4553E' },
});
