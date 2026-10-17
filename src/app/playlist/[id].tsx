import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/controls';
import { EpisodeRow } from '@/components/episode-row';
import { showPrompt, showSheet } from '@/components/sheet';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { queueEpisode } from '@/db/library';
import {
  deletePlaylist,
  getPlaylist,
  moveInPlaylist,
  playlistEpisodes,
  removeFromPlaylist,
  updatePlaylist,
} from '@/db/playlists';
import { useDbQuery } from '@/db/use-db-query';
import { playEpisode } from '@/player/controller';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = Number(id);
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const playlist = useDbQuery(['playlist'], (d) => getPlaylist(d, playlistId), [playlistId]).data;
  const episodes =
    useDbQuery(
      ['playlist', 'playlist_item', 'episode', 'episode_state', 'podcast'],
      async (d) => {
        const p = await getPlaylist(d, playlistId);
        return p ? playlistEpisodes(d, p) : [];
      },
      [playlistId],
    ).data ?? [];
  const manual = playlist?.type === 'manual';

  /** Plays the first episode and lines the rest up after it in Up Next. */
  const playAll = async () => {
    if (!episodes.length) return;
    for (const e of [...episodes.slice(1)].reverse()) await queueEpisode(db, e.id, 'next');
    await playEpisode(db, episodes[0].id);
  };

  const menu = () =>
    showSheet({
      title: playlist?.name,
      options: [
        manual
          ? {
              label: 'Rename',
              icon: 'pencil-simple',
              onPress: () =>
                showPrompt({
                  title: 'Rename playlist',
                  initial: playlist?.name,
                  onSubmit: (name) => void updatePlaylist(db, playlistId, name),
                }),
            }
          : {
              label: 'Edit rules',
              icon: 'sliders-horizontal',
              onPress: () => router.push(`/playlist-edit?id=${playlistId}`),
            },
        {
          label: 'Add all to Up Next',
          icon: 'queue',
          onPress: async () => {
            for (const e of episodes) await queueEpisode(db, e.id, 'last');
          },
        },
        {
          label: 'Delete playlist',
          icon: 'trash',
          destructive: true,
          onPress: () =>
            Alert.alert('Delete this playlist?', 'The episodes stay in your library.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  router.back();
                  void deletePlaylist(db, playlistId);
                },
              },
            ]),
        },
      ],
    });

  return (
    <SubScreen
      title={playlist?.name ?? 'Playlist'}
      actions={<IconButton icon="dots-three-vertical" label="Playlist options" onPress={menu} />}>
      <FlatList
        data={episodes}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        ListHeaderComponent={
          episodes.length ? (
            <View style={styles.header}>
              <Txt variant="small" secondary style={styles.flex}>
                {episodes.length} episode{episodes.length === 1 ? '' : 's'}
              </Txt>
              <Button label="Play all" icon="play-fill" onPress={() => void playAll()} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <EpisodeRow
            episode={item}
            showPodcast
            cards={theme.name !== 'paper'}
            trailing={
              manual ? (
                <View style={styles.trailing}>
                  {index > 0 && (
                    <IconButton
                      icon="caret-up"
                      size={18}
                      label="Move up"
                      hitSlop={4}
                      onPress={() =>
                        void moveInPlaylist(db, playlistId, item.id, episodes[index - 1].id)
                      }
                    />
                  )}
                  <IconButton
                    icon="x"
                    size={18}
                    label="Remove from playlist"
                    hitSlop={4}
                    onPress={() => void removeFromPlaylist(db, playlistId, item.id)}
                  />
                </View>
              ) : undefined
            }
          />
        )}
        ListEmptyComponent={
          <Txt secondary style={styles.empty}>
            {manual
              ? 'Nothing here yet. Open any episode and choose “Add to playlist”.'
              : 'No episodes match these rules right now.'}
          </Txt>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  trailing: { flexDirection: 'row', alignItems: 'center', marginRight: -Spacing.two },
  empty: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
