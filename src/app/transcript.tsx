import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, IconButton } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { useDbQuery } from '@/db/use-db-query';
import { clock } from '@/lib/format';
import { playEpisodeAt } from '@/player/controller';
import { useNowPlaying } from '@/player/use-now-playing';
import { usePlayerState } from '@/player/use-player';
import { shareAtLink } from '@/lib/share';
import { cueAt, ensureTranscript } from '@/transcripts/transcripts';
import { cancelTranscription, generateTranscript, speechAvailable } from '@/transcripts/whisper';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

/** The playing episode's transcript: follows along, tap a line to jump, search, share a passage. */
export default function TranscriptScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const episode = useNowPlaying();
  const player = usePlayerState();
  const list = useRef<FlatList>(null);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');
  const [hit, setHit] = useState(0);
  const [generating, setGenerating] = useState<{ progress: number; step: string } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const result = useDbQuery(
    ['transcript'],
    async (d) => (episode ? ensureTranscript(d, episode.id) : null),
    [episode?.id],
  );
  const cues = useMemo(() => result.data ?? [], [result.data]);
  const timed = cues.some((c) => c.start >= 0);
  const current = player.id === String(episode?.id) ? cueAt(cues, player.positionMs / 1000) : -1;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return cues.flatMap((c, i) => (c.text.toLowerCase().includes(q) ? [i] : []));
  }, [cues, query]);

  useEffect(() => {
    if (follow && current >= 0 && !matches.length) {
      list.current?.scrollToIndex({ index: current, viewPosition: 0.3, animated: true });
    }
  }, [current, follow, matches.length]);

  useEffect(() => {
    if (matches.length)
      list.current?.scrollToIndex({ index: matches[hit % matches.length], viewPosition: 0.3 });
  }, [matches, hit]);

  if (!episode) return <SubScreen title="Transcript">{null}</SubScreen>;

  const generate = async () => {
    setGenError(null);
    setGenerating({ progress: 0, step: 'Starting…' });
    try {
      await generateTranscript(db, episode.id, (progress, step) =>
        setGenerating({ progress, step }),
      );
      // The transcript table changed; the query above picks the new transcript up.
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Couldn’t make a transcript.');
    } finally {
      setGenerating(null);
    }
  };

  const share = (index: number) => {
    const c = cues[index];
    const at = c.start >= 0 ? ` (${clock(c.start * 1000)})` : '';
    const link =
      c.start >= 0 ? shareAtLink(episode, c.start) : (episode.link ?? episode.enclosure_url);
    void Share.share({
      message: `“${c.text}”${at}\n— ${episode.title}, ${episode.podcast_title}\n${link}`,
    });
  };

  return (
    <SubScreen
      title="Transcript"
      actions={
        timed ? (
          <IconButton
            icon="arrows-clockwise"
            label={follow ? 'Following along. Tap to stop.' : 'Follow along'}
            color={follow ? theme.accent : theme.textSecondary}
            filled={follow}
            onPress={() => setFollow((f) => !f)}
          />
        ) : undefined
      }>
      <View style={[styles.search, { backgroundColor: theme.element }]}>
        <Icon name="magnifying-glass" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setHit(0);
          }}
          placeholder="Search the transcript"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          returnKeyType="search"
          onSubmitEditing={() => setHit((h) => h + 1)}
        />
        {query.trim().length >= 2 && (
          <Pressable
            onPress={() => setHit((h) => h + 1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next match">
            <Txt variant="smallBold" secondary>
              {matches.length ? `${(hit % matches.length) + 1} / ${matches.length}` : '0'}
            </Txt>
          </Pressable>
        )}
      </View>
      <FlatList
        ref={list}
        data={cues}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{
          paddingBottom: insets.bottom + Spacing.six,
          paddingHorizontal: Spacing.three,
        }}
        onScrollBeginDrag={() => setFollow(false)}
        onScrollToIndexFailed={(e) =>
          list.current?.scrollToOffset({ offset: e.averageItemLength * e.index })
        }
        renderItem={({ item, index }) => {
          const isCurrent = index === current;
          const isMatch = matches.includes(index);
          return (
            <Pressable
              onPress={() => item.start >= 0 && void playEpisodeAt(db, episode.id, item.start)}
              onLongPress={() => share(index)}
              accessibilityRole="button"
              accessibilityHint={
                item.start >= 0 ? 'Plays from here. Long-press to share.' : 'Long-press to share.'
              }
              style={[
                styles.cue,
                isCurrent && { backgroundColor: theme.element },
                isMatch && { borderColor: theme.accent, borderWidth: 1 },
              ]}>
              {(item.speaker || item.start >= 0) && (
                <Txt variant="meta" secondary>
                  {[item.speaker, item.start >= 0 ? clock(item.start * 1000) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
              )}
              <Txt
                style={[styles.text, !isCurrent && current >= 0 && { opacity: 0.75 }]}
                color={isCurrent ? theme.text : undefined}>
                {item.text}
              </Txt>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt secondary>
              {result.status === 'loading'
                ? 'Loading the transcript…'
                : 'This episode doesn’t come with a transcript from the publisher.'}
            </Txt>
            {result.status !== 'loading' && speechAvailable && (
              <>
                {generating ? (
                  <View style={styles.generating}>
                    <Txt variant="small">{generating.step}</Txt>
                    <View style={[styles.progressTrack, { backgroundColor: theme.track }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${generating.progress * 100}%`, backgroundColor: theme.accent },
                        ]}
                      />
                    </View>
                    <Chip label="Stop" onPress={cancelTranscription} />
                  </View>
                ) : (
                  <Button
                    label="Make a transcript on this phone"
                    icon="sparkle"
                    onPress={() => void generate()}
                  />
                )}
                {!!genError && (
                  <Txt variant="small" color={theme.danger}>
                    {genError}
                  </Txt>
                )}
              </>
            )}
            {result.status !== 'loading' && (
              <Chip label="Back to the player" onPress={() => router.back()} />
            )}
          </View>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 15 },
  cue: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: Radius.medium,
    gap: 4,
  },
  text: { fontSize: 17, lineHeight: 26 },
  empty: { padding: Spacing.four, gap: Spacing.three, alignItems: 'flex-start' },
  generating: { alignSelf: 'stretch', gap: Spacing.two },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
});
