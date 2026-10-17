import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/controls';
import { ScreenHeader } from '@/components/screen-header';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { listFolders, type LibraryFolder } from '@/db/folders';
import { listLibrary, type LibraryPodcast } from '@/db/library';
import { FolderTile, PodcastTile } from '@/components/library-tiles';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { refreshAll } from '@/feeds/sync';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

const LAYOUTS = ['grid', 'large', 'list'] as const;

type Item =
  | { kind: 'folder'; key: string; folder: LibraryFolder }
  | { kind: 'podcast'; key: string; podcast: LibraryPodcast };

export default function PodcastsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const { width } = useWindowDimensions();
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const layout = settings.libraryLayout;
  const library = useDbQuery(
    ['podcast', 'episode', 'episode_state', 'folder'],
    async (d) => {
      const [folders, podcasts] = await Promise.all([
        listFolders(d),
        listLibrary(d, settings.librarySort, null),
      ]);
      return [
        ...folders.map((f) => ({ kind: 'folder' as const, key: `f${f.id}`, folder: f })),
        ...podcasts.map((p) => ({ kind: 'podcast' as const, key: `p${p.id}`, podcast: p })),
      ];
    },
    [settings.librarySort],
  );
  const [refreshing, setRefreshing] = useState(false);

  const columns = layout === 'grid' ? 3 : layout === 'large' ? 2 : 1;
  const gap = layout === 'grid' ? 12 : 14;
  const side = Spacing.four - 4;
  const tile = Math.floor((width - side * 2 - gap * (columns - 1)) / columns);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll(db);
    } finally {
      setRefreshing(false);
    }
  };

  const nextLayout = () => {
    const i = LAYOUTS.indexOf(layout);
    void setSetting('libraryLayout', LAYOUTS[(i + 1) % LAYOUTS.length]);
  };

  const renderItem = ({ item }: { item: Item }) =>
    item.kind === 'folder' ? (
      <FolderTile item={item.folder} layout={layout} size={tile} />
    ) : (
      <PodcastTile item={item.podcast} layout={layout} size={tile} />
    );

  const empty = library.status === 'success' && library.data.length === 0;

  return (
    <View style={styles.flex}>
      <FlatList
        key={layout}
        data={library.data ?? []}
        keyExtractor={(item) => item.key}
        numColumns={columns}
        renderItem={renderItem}
        columnWrapperStyle={columns > 1 ? { gap, paddingHorizontal: side } : undefined}
        ItemSeparatorComponent={columns > 1 ? () => <View style={{ height: gap }} /> : undefined}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={insets.top}
            colors={[theme.accent]}
            progressBackgroundColor={theme.dark ? '#222' : '#fff'}
          />
        }
        ListHeaderComponent={
          <ScreenHeader title="Podcasts">
            <IconButton
              icon="plus"
              label="Add a podcast"
              onPress={() => router.navigate('/discover')}
            />
            {!empty && (
              <IconButton
                icon={layout === 'list' ? 'squares-four' : layout === 'grid' ? 'grid-four' : 'rows'}
                label="Change layout"
                onPress={nextLayout}
              />
            )}
          </ScreenHeader>
        }
        ListEmptyComponent={
          empty ? (
            <View style={styles.empty}>
              <Txt variant="heading" style={styles.center}>
                No podcasts yet
              </Txt>
              <Txt secondary style={styles.center}>
                Search for shows, paste a feed address, or import a list from another app in
                Settings.
              </Txt>
              <Button
                label="Find podcasts"
                icon="magnifying-glass"
                onPress={() => router.navigate('/discover')}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.six,
  },
  center: { textAlign: 'center' },
});
