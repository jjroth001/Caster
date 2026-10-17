import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { Button } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { runAutoDownloads, setPodcastAutoDownload } from '@/downloads/auto-download';
import { writeBackgroundConfig } from '@/downloads/background';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

type Item = { id: number; title: string; artwork: string | null; chosen: boolean };

/** Picks the podcasts (or playlists) auto-download looks after. */
export default function AutoDownloadChooseScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const { kind } = useLocalSearchParams<{ kind: 'podcasts' | 'playlists' }>();
  const playlists = kind === 'playlists';
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();

  const podcastItems =
    useDbQuery(['podcast', 'podcast_settings'], (d) =>
      d.getAllAsync<{ id: number; title: string; artwork: string | null; chosen: number }>(
        `SELECT p.id, p.title, p.artwork_url AS artwork, COALESCE(ps.auto_download_n, 0) > 0 AS chosen
         FROM podcast p LEFT JOIN podcast_settings ps ON ps.podcast_id = p.id
         WHERE p.subscribed = 1 ORDER BY p.title COLLATE NOCASE`,
      ),
    ).data ?? [];
  const playlistRows =
    useDbQuery(['playlist'], (d) =>
      d.getAllAsync<{ id: number; name: string }>(
        'SELECT id, name FROM playlist ORDER BY sort_order, created_at',
      ),
    ).data ?? [];

  const items: Item[] = playlists
    ? playlistRows.map((p) => ({
        id: p.id,
        title: p.name,
        artwork: null,
        chosen: settings.autoDownloadPlaylists.includes(p.id),
      }))
    : podcastItems.map((p) => ({ ...p, chosen: !!p.chosen }));
  const allChosen = items.length > 0 && items.every((i) => i.chosen);

  const apply = async () => {
    await writeBackgroundConfig(db);
    await runAutoDownloads(db);
  };

  const choose = async (ids: number[], on: boolean) => {
    if (playlists) {
      const current = new Set(settings.autoDownloadPlaylists);
      ids.forEach((id) => (on ? current.add(id) : current.delete(id)));
      await setSetting('autoDownloadPlaylists', [...current]);
    } else {
      for (const id of ids) await setPodcastAutoDownload(db, id, on);
      // Choosing a podcast means you want its new episodes.
      if (on && !settings.autoDownloadNew) await setSetting('autoDownloadNew', true);
    }
    await apply();
  };

  return (
    <SubScreen
      title={playlists ? 'Choose playlists' : 'Choose podcasts'}
      actions={
        items.length > 0 ? (
          <Button
            label={allChosen ? 'None' : 'All'}
            kind="secondary"
            onPress={() =>
              void choose(
                items.map((i) => i.id),
                !allChosen,
              )
            }
          />
        ) : undefined
      }>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        ListEmptyComponent={
          <Txt secondary style={styles.empty}>
            {playlists ? 'No playlists yet.' : 'Follow some podcasts first.'}
          </Txt>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void choose([item.id], !item.chosen)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.chosen }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
            {playlists ? (
              <View style={[styles.playlistIcon, { backgroundColor: theme.element }]}>
                <Icon name="playlist" size={22} color={theme.accent} />
              </View>
            ) : (
              <Artwork uri={item.artwork} title={item.title} size={44} />
            )}
            <Txt variant="bodyBold" numberOfLines={2} style={styles.title}>
              {item.title}
            </Txt>
            {item.chosen ? (
              <Icon name="check-circle" size={26} color={theme.accent} duotone={false} />
            ) : (
              <View style={[styles.ring, { borderColor: theme.textSecondary }]} />
            )}
          </Pressable>
        )}
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    minHeight: 60,
  },
  title: { flex: 1 },
  playlistIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginHorizontal: 2 },
  empty: { textAlign: 'center', marginTop: Spacing.five },
});
