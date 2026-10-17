import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerCore } from '@modules/player-core/src';
import { Button, Card, Chip } from '@/components/controls';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { clock } from '@/lib/format';
import { engine } from '@/player/engine';
import { useNowPlaying } from '@/player/use-now-playing';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const MAX_S = 180;
type Format = 'audio' | 'square' | 'story';

function Nudge({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.nudge,
        { backgroundColor: theme.element },
        pressed && { opacity: 0.6 },
      ]}>
      <Txt variant="smallBold">{label}</Txt>
    </Pressable>
  );
}

/** Pick up to three minutes of the playing episode and share it as audio or a cover-art video. */
export default function ClipScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const episode = useNowPlaying();
  const player = usePlayerState();
  const durationS = (player.durationMs ?? (episode?.duration_s ?? 0) * 1000) / 1000;
  const here = player.positionMs / 1000;
  const [range, setRange] = useState(() => ({
    start: Math.max(0, here - 30),
    end: Math.max(1, here),
  }));
  const [format, setFormat] = useState<Format>('audio');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!episode) return <SubScreen title="Make a clip">{null}</SubScreen>;
  const core = PlayerCore;
  if (!core) {
    return (
      <SubScreen title="Make a clip">
        <Txt secondary style={styles.pad}>
          Clips need the installed app (they can’t be made in Expo Go).
        </Txt>
      </SubScreen>
    );
  }

  /** Keeps the range inside the episode, at least a second and at most three minutes long. */
  const clamp = (start: number, end: number) => {
    let s = Math.max(0, durationS ? Math.min(start, durationS - 1) : start);
    let e = Math.max(s + 1, durationS ? Math.min(end, durationS) : end);
    if (e - s > MAX_S) {
      if (start !== range.start) e = s + MAX_S;
      else s = e - MAX_S;
    }
    setRange({ start: s, end: e });
  };
  const length = range.end - range.start;
  const left = durationS ? range.start / durationS : 0;
  const width = durationS ? length / durationS : 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const uri = await core.makeClip({
        source: episode.local_path ?? episode.enclosure_url,
        startMs: range.start * 1000,
        endMs: range.end * 1000,
        artworkUrl: episode.artwork_url ?? episode.podcast_artwork,
        format,
      });
      await Sharing.shareAsync(uri, {
        mimeType: format === 'audio' ? 'audio/mp4' : 'video/mp4',
        dialogTitle: `Clip from ${episode.title}`,
      });
    } catch {
      setError(
        format === 'audio'
          ? 'Couldn’t make this clip. Check your connection, or download the episode first.'
          : 'Couldn’t make the video. Try an audio clip instead.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen title="Make a clip">
      <ScrollView
        contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + Spacing.six }]}>
        <Txt variant="bodyBold" numberOfLines={2}>
          {episode.title}
        </Txt>
        <Txt variant="small" secondary>
          {episode.podcast_title}
        </Txt>

        <View style={[styles.track, { backgroundColor: theme.track }]}>
          <View
            style={[
              styles.selection,
              {
                left: `${left * 100}%`,
                width: `${Math.max(width * 100, 1)}%`,
                backgroundColor: theme.accent,
              },
            ]}
          />
        </View>
        <Txt variant="small" secondary style={styles.center}>
          {clock(range.start * 1000)} – {clock(range.end * 1000)} · {Math.round(length)} s (up to
          3 min)
        </Txt>

        <Card style={styles.card}>
          <Txt variant="bodyBold">Start {clock(range.start * 1000)}</Txt>
          <View style={styles.nudges}>
            <Nudge label="−10 s" onPress={() => clamp(range.start - 10, range.end)} />
            <Nudge label="−1 s" onPress={() => clamp(range.start - 1, range.end)} />
            <Nudge label="+1 s" onPress={() => clamp(range.start + 1, range.end)} />
            <Nudge label="+10 s" onPress={() => clamp(range.start + 10, range.end)} />
            <Nudge label="Now" onPress={() => clamp(here, Math.max(range.end, here + 1))} />
          </View>
          <Txt variant="bodyBold" style={styles.endLabel}>
            End {clock(range.end * 1000)}
          </Txt>
          <View style={styles.nudges}>
            <Nudge label="−10 s" onPress={() => clamp(range.start, range.end - 10)} />
            <Nudge label="−1 s" onPress={() => clamp(range.start, range.end - 1)} />
            <Nudge label="+1 s" onPress={() => clamp(range.start, range.end + 1)} />
            <Nudge label="+10 s" onPress={() => clamp(range.start, range.end + 10)} />
            <Nudge label="Now" onPress={() => clamp(Math.min(range.start, here - 1), here)} />
          </View>
          <Button
            label="Listen from the start"
            icon="play-fill"
            kind="secondary"
            onPress={() => {
              void engine.seekTo(range.start * 1000);
              void engine.play();
            }}
            style={styles.preview}
          />
        </Card>

        <Txt variant="bodyBold" style={styles.formatLabel}>
          Share as
        </Txt>
        <View style={styles.nudges}>
          <Chip label="Audio" selected={format === 'audio'} onPress={() => setFormat('audio')} />
          <Chip
            label="Square video"
            selected={format === 'square'}
            onPress={() => setFormat('square')}
          />
          <Chip
            label="Story video"
            selected={format === 'story'}
            onPress={() => setFormat('story')}
          />
        </View>
        {format !== 'audio' && (
          <Txt variant="small" secondary>
            The video shows the episode’s cover art while the clip plays.
          </Txt>
        )}

        {error && (
          <Txt variant="small" color={theme.danger}>
            {error}
          </Txt>
        )}
        {busy ? (
          <ActivityIndicator color={theme.accent} style={styles.create} />
        ) : (
          <Button
            label="Create and share"
            icon="share-network"
            onPress={() => void create()}
            style={styles.create}
          />
        )}
      </ScrollView>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  center: { textAlign: 'center' },
  track: { height: 10, borderRadius: 5, marginTop: Spacing.four, overflow: 'hidden' },
  selection: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  card: { padding: Spacing.three, marginTop: Spacing.three, gap: Spacing.two },
  nudges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  nudge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill },
  endLabel: { marginTop: Spacing.two },
  preview: { marginTop: Spacing.two },
  formatLabel: { marginTop: Spacing.three },
  create: { marginTop: Spacing.four },
});
