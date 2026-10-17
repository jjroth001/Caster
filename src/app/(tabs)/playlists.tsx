import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { ScreenHeader } from '@/components/screen-header';
import { showPrompt, showSheet } from '@/components/sheet';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { createPlaylist, listPlaylists, seedPlaylists } from '@/db/playlists';
import { useDbQuery } from '@/db/use-db-query';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Row = { key: string; title: string; hint: string; icon: IconName; href: string };

export default function PlaylistsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const playlists = useDbQuery(['playlist', 'playlist_item'], listPlaylists).data ?? [];
  const bookmarks =
    useDbQuery(
      ['bookmark'],
      async (d) =>
        (await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM bookmark'))?.n ?? 0,
    ).data ?? 0;
  const downloads =
    useDbQuery(
      ['episode_state'],
      async (d) =>
        (
          await d.getFirstAsync<{ n: number }>(
            'SELECT COUNT(*) AS n FROM episode_state WHERE local_path IS NOT NULL',
          )
        )?.n ?? 0,
    ).data ?? 0;

  useEffect(() => {
    void seedPlaylists(db);
  }, [db]);

  const rows: Row[] = [
    {
      key: 'bookmarks',
      title: 'Bookmarks',
      hint: `${bookmarks} saved`,
      icon: 'bookmarks-simple',
      href: '/bookmarks',
    },
    {
      key: 'downloads',
      title: 'Downloads',
      hint: `${downloads} episode${downloads === 1 ? '' : 's'}`,
      icon: 'download-simple',
      href: '/downloads',
    },
    ...playlists.map((p) => ({
      key: `p${p.id}`,
      title: p.name,
      hint: p.type === 'smart' ? 'Smart playlist' : `${p.count} episode${p.count === 1 ? '' : 's'}`,
      icon: (p.type === 'smart' ? 'sparkle' : 'playlist') as IconName,
      href: `/playlist/${p.id}`,
    })),
  ];

  const create = () =>
    showSheet({
      title: 'New playlist',
      options: [
        {
          label: 'Playlist',
          hint: 'Add episodes to it yourself',
          icon: 'playlist',
          onPress: () =>
            showPrompt({
              title: 'New playlist',
              placeholder: 'Playlist name',
              confirm: 'Create',
              onSubmit: async (name) => {
                const id = await createPlaylist(db, name, 'manual');
                router.push(`/playlist/${id}`);
              },
            }),
        },
        {
          label: 'Smart playlist',
          hint: 'Fills itself from rules, like “unplayed and under 30 minutes”',
          icon: 'sparkle',
          onPress: () => router.push('/playlist-edit'),
        },
      ],
    });

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}
      ListHeaderComponent={
        <ScreenHeader title="Playlists">
          <IconButton icon="plus" label="New playlist" onPress={create} />
        </ScreenHeader>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(item.href as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
            pressed && { opacity: 0.7 },
          ]}>
          <View style={[styles.icon, { backgroundColor: theme.element }]}>
            <Icon name={item.icon} size={22} color={theme.accent} />
          </View>
          <View style={styles.text}>
            <Txt variant="bodyBold" numberOfLines={1}>
              {item.title}
            </Txt>
            <Txt variant="small" secondary>
              {item.hint}
            </Txt>
          </View>
          <Icon name="caret-right" size={18} color={theme.textSecondary} duotone={false} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
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
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
