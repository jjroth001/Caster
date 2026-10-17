import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { Card, IconButton } from '@/components/controls';
import { showSheet } from '@/components/sheet';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { useDbQuery } from '@/db/use-db-query';
import { releaseDate } from '@/lib/format';
import { shareAllTranscripts, shareTranscript } from '@/lib/transcript-share';
import { useAutoTranscribeStatus } from '@/transcripts/auto';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Item = {
  episode_id: number;
  source: string;
  fetched_at: number;
  chars: number;
  title: string;
  podcast: string;
  artwork: string | null;
  pub_date: number | null;
};

/** Every transcript on the phone: open one, export one, or export them all. */
export default function TranscriptsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const auto = useAutoTranscribeStatus();
  const items =
    useDbQuery(['transcript'], (d) =>
      d.getAllAsync<Item>(
        `SELECT t.episode_id, t.source, t.fetched_at, LENGTH(t.cues_json) AS chars, e.title, e.pub_date,
           p.title AS podcast, COALESCE(e.artwork_url, p.artwork_url) AS artwork
         FROM transcript t JOIN episode e ON e.id = t.episode_id JOIN podcast p ON p.id = e.podcast_id
         ORDER BY e.pub_date DESC`,
      ),
    ).data ?? [];

  const menu = (item: Item) =>
    showSheet({
      title: item.title,
      options: [
        {
          label: 'Open',
          icon: 'file-text',
          onPress: () => router.push(`/transcript?episode=${item.episode_id}`),
        },
        {
          label: 'Export',
          icon: 'export',
          onPress: () => void shareTranscript(db, item.episode_id),
        },
        ...(item.source === 'generated'
          ? [
              {
                label: 'Delete',
                hint: 'You can make it again later',
                icon: 'trash' as const,
                destructive: true,
                onPress: () =>
                  Alert.alert('Delete this transcript?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        void db.runAsync(
                          'DELETE FROM transcript WHERE episode_id = ?',
                          item.episode_id,
                        ),
                    },
                  ]),
              },
            ]
          : []),
      ],
    });

  const statusText =
    auto.state === 'working'
      ? `Transcribing “${auto.title}” · ${Math.round(auto.progress * 100)}%${auto.pending ? ` · ${auto.pending} more waiting` : ''}`
      : auto.state === 'waiting'
        ? auto.reason === 'charging'
          ? `${auto.pending} downloaded episode${auto.pending === 1 ? '' : 's'} will be transcribed when your phone is charging`
          : 'Download a speech model in Settings to transcribe automatically'
        : null;

  return (
    <SubScreen
      title="Transcripts"
      actions={
        items.length > 0 ? (
          <IconButton
            icon="export"
            label="Export all transcripts"
            onPress={() => void shareAllTranscripts(db)}
          />
        ) : undefined
      }>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.episode_id)}
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        ListHeaderComponent={
          statusText ? (
            <Card style={styles.status}>
              <Txt variant="small">{statusText}</Txt>
              {auto.state === 'working' && (
                <View style={[styles.track, { backgroundColor: theme.track }]}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${auto.progress * 100}%`, backgroundColor: theme.accent },
                    ]}
                  />
                </View>
              )}
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/transcript?episode=${item.episode_id}`)}
            onLongPress={() => menu(item)}
            accessibilityRole="button"
            accessibilityHint="Opens the transcript. Long-press to export."
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
              pressed && { opacity: 0.7 },
            ]}>
            <Artwork uri={item.artwork} title={item.podcast} size={48} radius={10} />
            <View style={styles.text}>
              <Txt variant="meta" secondary numberOfLines={1}>
                {item.podcast}
              </Txt>
              <Txt variant="bodyBold" numberOfLines={2}>
                {item.title}
              </Txt>
              <Txt variant="small" secondary>
                {[
                  releaseDate(item.pub_date),
                  item.source === 'generated' ? 'Made on this phone' : 'From the publisher',
                  `about ${Math.max(1, Math.round(item.chars / 6 / 100) * 100).toLocaleString()} words`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>
            </View>
            <IconButton
              icon="dots-three-vertical"
              size={20}
              label="Transcript options"
              onPress={() => menu(item)}
              hitSlop={4}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Txt secondary style={styles.empty}>
            No transcripts yet. They appear here when an episode comes with one from the publisher,
            or when Caster makes one on your phone (Settings → Generated transcripts).
          </Txt>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  status: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 3 },
  empty: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
