import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { Icon } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import type { LibraryFolder } from '@/db/folders';
import type { LibraryPodcast } from '@/db/library';
import { releaseDate } from '@/lib/format';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

export type Layout = 'grid' | 'large' | 'list';

export function Badge({ count }: { count: number }) {
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

const label = (title: string, count: number) => `${title}${count ? `, ${count} new` : ''}`;

export function PodcastTile({
  item,
  layout,
  size,
}: {
  item: LibraryPodcast;
  layout: Layout;
  size: number;
}) {
  const theme = useTheme();
  const open = () => router.push(`/podcast/${item.id}`);
  if (layout === 'list') {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label(item.title, item.new_count)}
        style={({ pressed }) => [
          styles.listRow,
          { borderBottomColor: theme.cardBorder },
          pressed && styles.pressed,
        ]}>
        <Artwork uri={item.artwork_url} title={item.title} size={56} radius={10} />
        <View style={styles.listText}>
          <Txt variant="bodyBold" numberOfLines={1} style={theme.serifTitles ? styles.serif : null}>
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
      accessibilityLabel={label(item.title, item.new_count)}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}>
      <Artwork
        uri={item.artwork_url}
        title={item.title}
        size={size}
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
}

/** A folder: its colour with up to four covers inside. */
export function FolderTile({
  item,
  layout,
  size,
}: {
  item: LibraryFolder;
  layout: Layout;
  size: number;
}) {
  const theme = useTheme();
  const open = () => router.push(`/folder/${item.id}`);
  const covers = (box: number) => {
    const gap = Math.max(3, box * 0.05);
    const cell = (box - gap * 3) / 2;
    return (
      <View
        style={[
          styles.folder,
          {
            width: box,
            height: box,
            borderRadius: layout === 'large' ? 20 : layout === 'list' ? 10 : 14,
            backgroundColor: item.color,
            padding: gap,
            gap,
          },
        ]}>
        {[0, 1, 2, 3].map((i) =>
          item.artworks[i] !== undefined ? (
            <Artwork
              key={i}
              uri={item.artworks[i]}
              title={item.name}
              size={cell}
              radius={Math.max(4, cell * 0.12)}
            />
          ) : (
            <View
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: Math.max(4, cell * 0.12),
                backgroundColor: 'rgba(255,255,255,0.18)',
              }}
            />
          ),
        )}
      </View>
    );
  };
  const summary = `${item.podcast_count} podcast${item.podcast_count === 1 ? '' : 's'}`;
  if (layout === 'list') {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Folder ${label(item.name, item.new_count)}`}
        style={({ pressed }) => [
          styles.listRow,
          { borderBottomColor: theme.cardBorder },
          pressed && styles.pressed,
        ]}>
        {covers(56)}
        <View style={styles.listText}>
          <View style={styles.folderName}>
            <Icon name="folder" size={16} color={item.color} />
            <Txt
              variant="bodyBold"
              numberOfLines={1}
              style={theme.serifTitles ? styles.serif : null}>
              {item.name}
            </Txt>
          </View>
          <Txt variant="small" secondary>
            {summary}
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
      accessibilityLabel={`Folder ${label(item.name, item.new_count)}`}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}>
      {covers(size)}
      {layout === 'grid' ? (
        <>
          <View style={styles.gridBadge}>
            <Badge count={item.new_count} />
          </View>
          <Txt variant="smallBold" numberOfLines={1} style={styles.gridName}>
            {item.name}
          </Txt>
        </>
      ) : (
        <View style={styles.largeText}>
          <Txt variant="bodyBold" numberOfLines={1}>
            {item.name}
          </Txt>
          <Txt variant="small" secondary numberOfLines={1}>
            {summary}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  gridName: { marginTop: 6, paddingHorizontal: 2 },
  largeText: { paddingTop: 8, paddingHorizontal: 2 },
  folder: { flexDirection: 'row', flexWrap: 'wrap' },
  folderName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
