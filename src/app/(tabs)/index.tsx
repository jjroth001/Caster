import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Reanimated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { Button, IconButton } from '@/components/controls';
import { FolderTile, PodcastTile } from '@/components/library-tiles';
import { ScreenHeader } from '@/components/screen-header';
import { showSheet } from '@/components/sheet';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { listFolders, saveLibraryOrder, type LibraryFolder } from '@/db/folders';
import { listLibrary, type LibraryPodcast } from '@/db/library';
import { DEFAULT_SETTINGS, LIBRARY_SORTS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { refreshAll } from '@/feeds/sync';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

const LAYOUTS = ['grid', 'large', 'list'] as const;

type Item =
  | { kind: 'folder'; key: string; order: number; folder: LibraryFolder }
  | { kind: 'podcast'; key: string; order: number; podcast: LibraryPodcast };

export default function PodcastsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const { width } = useWindowDimensions();
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const scrollRef = useAnimatedRef<Reanimated.ScrollView>();
  const layout = settings.libraryLayout;
  const sort = settings.librarySort;
  const library = useDbQuery(
    ['podcast', 'episode', 'episode_state', 'folder'],
    async (d) => {
      const [folders, podcasts] = await Promise.all([listFolders(d), listLibrary(d, sort, null)]);
      const items: Item[] = [
        ...folders.map((f) => ({
          kind: 'folder' as const,
          key: `f${f.id}`,
          order: f.sort_order,
          folder: f,
        })),
        ...podcasts.map((p) => ({
          kind: 'podcast' as const,
          key: `p${p.id}`,
          order: p.sort_order,
          podcast: p,
        })),
      ];
      // Your own order mixes folders in among the podcasts; other orders list folders first.
      return sort === 'manual' ? items.sort((a, b) => a.order - b.order) : items;
    },
    [sort],
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

  const chooseSort = () =>
    showSheet({
      title: 'Sort by',
      choice: true,
      options: LIBRARY_SORTS.map((s) => ({
        label: s.label,
        hint: s.value === 'manual' ? 'Press and hold a podcast to move it' : undefined,
        selected: s.value === sort,
        onPress: () => void setSetting('librarySort', s.value),
      })),
    });

  const folderMenu = () => {
    const folders = (library.data ?? []).filter((i) => i.kind === 'folder');
    if (folders.length === 0) {
      router.push('/folder-edit');
      return;
    }
    showSheet({
      title: 'Folders',
      options: [
        { label: 'New folder', icon: 'folder-plus', onPress: () => router.push('/folder-edit') },
        ...folders.map((f) => ({
          label: `Edit ${f.folder.name}`,
          icon: 'folder' as const,
          onPress: () => router.push(`/folder-edit?id=${f.folder.id}`),
        })),
      ],
    });
  };

  // Dropping a podcast where you want it switches to your own order and saves it.
  const onDragEnd = ({
    data,
    fromIndex,
    toIndex,
  }: {
    data: Item[];
    fromIndex: number;
    toIndex: number;
  }) => {
    if (fromIndex === toIndex) return;
    void (async () => {
      await saveLibraryOrder(
        db,
        data.map((i) => ({ kind: i.kind, id: i.kind === 'folder' ? i.folder.id : i.podcast.id })),
      );
      if (sort !== 'manual') await setSetting('librarySort', 'manual');
    })();
  };

  const data = library.data ?? [];
  const empty = library.status === 'success' && data.length === 0;

  return (
    <View style={styles.flex}>
      <Reanimated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={insets.top}
            colors={[theme.accent]}
            progressBackgroundColor={theme.dark ? '#222' : '#fff'}
          />
        }>
        <ScreenHeader title="Podcasts">
          <IconButton
            icon="plus"
            label="Add a podcast"
            onPress={() => router.navigate('/discover')}
          />
          {!empty && (
            <>
              <IconButton icon="folder-plus" label="Folders" onPress={folderMenu} />
              <IconButton
                icon={layout === 'list' ? 'squares-four' : layout === 'grid' ? 'grid-four' : 'rows'}
                label="Change layout"
                onPress={nextLayout}
              />
              <IconButton icon="dots-three-vertical" label="Sort" onPress={chooseSort} />
            </>
          )}
        </ScreenHeader>
        {empty ? (
          <View style={styles.empty}>
            <Txt variant="heading" style={styles.center}>
              No podcasts yet
            </Txt>
            <Txt secondary style={styles.center}>
              Search for shows, paste a feed address, or import a list from another app in Settings.
            </Txt>
            <Button
              label="Find podcasts"
              icon="magnifying-glass"
              onPress={() => router.navigate('/discover')}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: columns > 1 ? side : 0 }}>
            <Sortable.Grid
              key={layout}
              data={data}
              keyExtractor={(item) => item.key}
              columns={columns}
              rowGap={columns > 1 ? gap : 0}
              columnGap={columns > 1 ? gap : 0}
              scrollableRef={scrollRef}
              dragActivationDelay={300}
              activeItemScale={1.06}
              onDragEnd={onDragEnd}
              renderItem={({ item }) =>
                item.kind === 'folder' ? (
                  <FolderTile item={item.folder} layout={layout} size={tile} />
                ) : (
                  <PodcastTile item={item.podcast} layout={layout} size={tile} />
                )
              }
            />
          </View>
        )}
      </Reanimated.ScrollView>
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
