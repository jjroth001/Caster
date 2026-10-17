import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { Button } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import {
  createFolder,
  deleteFolder,
  FOLDER_COLORS,
  getFolder,
  renameFolder,
  setFolderColor,
  setFolderPodcasts,
} from '@/db/folders';
import { useDbQuery } from '@/db/use-db-query';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Row = {
  id: number;
  title: string;
  artwork_url: string | null;
  folder_id: number | null;
  folder_name: string | null;
};

/** Makes a folder, or edits one: its name, colour and which podcasts are in it. */
export default function FolderEditScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const folderId = id ? Number(id) : null;
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [chosen, setChosen] = useState<Set<number> | null>(null);

  const podcasts =
    useDbQuery(['podcast', 'folder'], (d) =>
      d.getAllAsync<Row>(
        `SELECT p.id, p.title, p.artwork_url, p.folder_id, f.name AS folder_name
         FROM podcast p LEFT JOIN folder f ON f.id = p.folder_id
         WHERE p.subscribed = 1 ORDER BY p.title COLLATE NOCASE`,
      ),
    ).data ?? [];

  // Start from the folder as it is (once its details load).
  useEffect(() => {
    let live = true;
    void (async () => {
      if (folderId == null) {
        const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM folder');
        if (live) setColor(FOLDER_COLORS[(n?.n ?? 0) % FOLDER_COLORS.length]);
        if (live) setChosen(new Set());
        return;
      }
      const folder = await getFolder(db, folderId);
      const members = await db.getAllAsync<{ id: number }>(
        'SELECT id FROM podcast WHERE folder_id = ?',
        folderId,
      );
      if (!live || !folder) return;
      setName(folder.name);
      setColor(folder.color);
      setChosen(new Set(members.map((m) => m.id)));
    })();
    return () => {
      live = false;
    };
  }, [db, folderId]);

  const toggle = (podcastId: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(podcastId)) next.delete(podcastId);
      else next.add(podcastId);
      return next;
    });

  const save = async () => {
    const ids = [...(chosen ?? [])];
    const target = folderId ?? (await createFolder(db, name));
    if (folderId != null) await renameFolder(db, target, name);
    await setFolderColor(db, target, color);
    await setFolderPodcasts(db, target, ids);
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this folder?', 'Its podcasts go back to your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (folderId == null) return;
          void deleteFolder(db, folderId).then(() => router.navigate('/'));
        },
      },
    ]);

  const count = chosen?.size ?? 0;

  return (
    <SubScreen
      title={folderId == null ? 'New folder' : 'Edit folder'}
      actions={<Button label="Save" onPress={() => void save()} disabled={!name.trim()} />}>
      <FlatList
        data={podcasts}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus={folderId == null}
              placeholder="Folder name"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              style={[styles.input, { color: theme.text, backgroundColor: theme.element }]}
            />
            <View style={styles.colors}>
              {FOLDER_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: c === color }}
                  accessibilityLabel={`Colour ${c}`}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    c === color && { borderColor: theme.text },
                  ]}>
                  {c === color && <Icon name="check" size={18} color="#fff" duotone={false} />}
                </Pressable>
              ))}
            </View>
            <View style={styles.listTitle}>
              <Txt variant="meta" secondary>
                {count === 1 ? '1 podcast' : `${count} podcasts`}
              </Txt>
              {folderId != null && (
                <Pressable onPress={remove} accessibilityRole="button" hitSlop={8}>
                  <Txt variant="smallBold" color={theme.danger}>
                    Delete folder
                  </Txt>
                </Pressable>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const on = chosen?.has(item.id) ?? false;
          const elsewhere = !on && item.folder_id != null && item.folder_id !== folderId;
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
              <Artwork uri={item.artwork_url} title={item.title} size={44} />
              <View style={styles.rowText}>
                <Txt variant="bodyBold" numberOfLines={2}>
                  {item.title}
                </Txt>
                {elsewhere && (
                  <Txt variant="small" secondary numberOfLines={1}>
                    In {item.folder_name}
                  </Txt>
                )}
              </View>
              {on ? (
                <Icon name="check-circle" size={26} color={theme.accent} duotone={false} />
              ) : (
                <View style={[styles.ring, { borderColor: theme.textSecondary }]} />
              )}
            </Pressable>
          );
        }}
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three },
  input: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 17,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 60,
  },
  rowText: { flex: 1, gap: 2 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginHorizontal: 2 },
});
