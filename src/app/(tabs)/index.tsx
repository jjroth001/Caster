import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Button, IconButton } from '@/components/controls';
import { ScreenHeader } from '@/components/screen-header';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { listLibrary, type LibraryPodcast } from '@/db/library';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { refreshAll } from '@/feeds/sync';
import { releaseDate } from '@/lib/format';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const LAYOUTS = ['grid', 'large', 'list'] as const;

function Badge({ count }: { count: number }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.accent }]}>
      <Txt variant="smallBold" color={theme.onAccent} style={styles.badgeText}>
        {count > 99 ? '99+' : count}
      </Txt>
    </View>
  );
}

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
    ['podcast', 'episode', 'episode_state'],
    (d) => listLibrary(d, settings.librarySort),
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

  const renderItem = ({ item }: { item: LibraryPodcast }) => {
    const open = () => router.push(`/podcast/${item.id}`);
    if (layout === 'list') {
      return (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.new_count ? `, ${item.new_count} new` : ''}`}
          style={({ pressed }) => [
            styles.listRow,
            { borderBottomColor: theme.cardBorder },
            pressed && styles.pressed,
          ]}>
          <Artwork uri={item.artwork_url} title={item.title} size={56} radius={10} />
          <View style={styles.listText}>
            <Txt
              variant="bodyBold"
              numberOfLines={1}
              style={theme.serifTitles ? styles.serif : null}>
              {item.title}
            </Txt>
            <Txt variant="small" secondary numberOfLines={1}>
              {[releaseDate(item.latest_pub), item.latest_title].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Badge count={item.new_count} />
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.new_count ? `, ${item.new_count} new` : ''}`}
        style={({ pressed }) => [{ width: tile }, pressed && styles.pressed]}>
        <Artwork
          uri={item.artwork_url}
          title={item.title}
          size={tile}
          radius={layout === 'large' ? 20 : 14}
        />
        {layout === 'grid' ? (
          <View style={styles.gridBadge}>
            <Badge count={item.new_count} />
          </View>
        ) : (
          <View style={styles.largeText}>
            <Txt variant="bodyBold" numberOfLines={1}>
              {item.title}
            </Txt>
            <Txt
              variant="small"
              color={item.new_count ? theme.accent : theme.textSecondary}
              numberOfLines={1}>
              {item.new_count ? `${item.new_count} new` : 'Up to date'}
            </Txt>
          </View>
        )}
      </Pressable>
    );
  };

  const empty = library.status === 'success' && library.data.length === 0;

  return (
    <View style={styles.flex}>
      <FlatList
        key={layout}
        data={library.data ?? []}
        keyExtractor={(p) => String(p.id)}
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
  pressed: { opacity: 0.7 },
  serif: { fontFamily: 'serif', fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listText: { flex: 1, gap: 2 },
  gridBadge: { position: 'absolute', top: 6, right: 6 },
  largeText: { paddingTop: 8, paddingHorizontal: 2 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.six,
  },
  center: { textAlign: 'center' },
});
