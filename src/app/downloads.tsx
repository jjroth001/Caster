import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/controls';
import { EpisodeRow } from '@/components/episode-row';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { listDownloads } from '@/db/library';
import { useDbQuery } from '@/db/use-db-query';
import { downloadedBytes, removeDownload, removePlayedDownloads } from '@/downloads/downloads';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export default function DownloadsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const episodes = useDbQuery(['episode_state', 'episode'], listDownloads).data ?? [];
  const total = episodes.length ? downloadedBytes() : 0;

  const clearPlayed = () =>
    Alert.alert(
      'Remove played downloads?',
      'Episodes you’ve finished are deleted from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void removePlayedDownloads(db) },
      ],
    );

  return (
    <SubScreen
      title="Downloads"
      actions={<IconButton icon="trash" label="Remove played downloads" onPress={clearPlayed} />}>
      <FlatList
        data={episodes}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}
        ListHeaderComponent={
          <Txt variant="small" secondary style={styles.summary}>
            {episodes.length
              ? `${episodes.length} episode${episodes.length === 1 ? '' : 's'} · ${size(total)}`
              : 'Nothing downloaded yet. Use Download on an episode, or turn on auto-download in Settings.'}
          </Txt>
        }
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            showPodcast
            cards={theme.name !== 'paper'}
            trailing={
              <IconButton
                icon="x"
                size={18}
                label="Remove download"
                onPress={() => void removeDownload(db, item.id)}
                hitSlop={4}
              />
            }
          />
        )}
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  summary: { marginHorizontal: Spacing.four, marginBottom: Spacing.three },
});
