import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/controls';
import { PodcastTile } from '@/components/library-tiles';
import { showPrompt, showSheet } from '@/components/sheet';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { deleteFolder, FOLDER_COLORS, getFolder, renameFolder, setFolderColor } from '@/db/folders';
import { listLibrary } from '@/db/library';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSettings } from '@/db/use-settings';
import { Spacing } from '@/theme/themes';

const COLOR_NAMES = ['Coral', 'Apricot', 'Sage', 'Blue', 'Violet', 'Rose', 'Stone'];

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = Number(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const folder = useDbQuery(['folder'], (d) => getFolder(d, folderId), [folderId]).data;
  const podcasts =
    useDbQuery(
      ['podcast', 'episode', 'episode_state'],
      (d) => listLibrary(d, settings.librarySort, folderId),
      [folderId, settings.librarySort],
    ).data ?? [];
  const layout = settings.libraryLayout;
  const columns = layout === 'grid' ? 3 : layout === 'large' ? 2 : 1;
  const gap = layout === 'grid' ? 12 : 14;
  const side = Spacing.four - 4;
  const tile = Math.floor((width - side * 2 - gap * (columns - 1)) / columns);

  const menu = () =>
    showSheet({
      title: folder?.name,
      options: [
        {
          label: 'Rename',
          icon: 'pencil-simple',
          onPress: () =>
            showPrompt({
              title: 'Rename folder',
              initial: folder?.name,
              onSubmit: (name) => void renameFolder(db, folderId, name),
            }),
        },
        {
          label: 'Colour',
          icon: 'palette',
          onPress: () =>
            showSheet({
              title: 'Folder colour',
              options: FOLDER_COLORS.map((c, i) => ({
                label: COLOR_NAMES[i],
                selected: folder?.color === c,
                onPress: () => void setFolderColor(db, folderId, c),
              })),
            }),
        },
        {
          label: 'Delete folder',
          icon: 'trash',
          destructive: true,
          onPress: () =>
            Alert.alert(
              'Delete this folder?',
              'Its podcasts stay; they move back to the main list.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    router.back();
                    void deleteFolder(db, folderId);
                  },
                },
              ],
            ),
        },
      ],
    });

  return (
    <SubScreen
      title={folder?.name ?? 'Folder'}
      actions={<IconButton icon="dots-three-vertical" label="Folder options" onPress={menu} />}>
      <FlatList
        key={layout}
        data={podcasts}
        keyExtractor={(p) => String(p.id)}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap, paddingHorizontal: side } : undefined}
        ItemSeparatorComponent={columns > 1 ? () => <View style={{ height: gap }} /> : undefined}
        contentContainerStyle={{
          paddingBottom: insets.bottom + Spacing.five,
          paddingTop: Spacing.two,
        }}
        renderItem={({ item }) => <PodcastTile item={item} layout={layout} size={tile} />}
        ListEmptyComponent={
          <Txt secondary style={styles.empty}>
            This folder is empty. Use “Move to folder” in a podcast’s menu to add it here.
          </Txt>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  empty: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
