import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { IconButton } from '@/components/controls';
import { showPrompt, showSheet } from '@/components/sheet';
import { Txt } from '@/components/text';
import { deleteBookmark, renameBookmark, type BookmarkItem } from '@/db/bookmarks';
import { clock, releaseDate } from '@/lib/format';
import { playEpisodeAt } from '@/player/controller';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

export function bookmarkMenu(db: ReturnType<typeof useSQLiteContext>, b: BookmarkItem) {
  showSheet({
    title: b.title,
    options: [
      {
        label: `Play from ${clock(b.position_s * 1000)}`,
        icon: 'play-fill',
        onPress: () => void playEpisodeAt(db, b.episode_id, b.position_s),
      },
      {
        label: 'Rename',
        icon: 'pencil-simple',
        onPress: () =>
          showPrompt({
            title: 'Rename bookmark',
            initial: b.title,
            onSubmit: (t) => void renameBookmark(db, b.id, t),
          }),
      },
      {
        label: 'Delete',
        icon: 'trash',
        destructive: true,
        onPress: () => void deleteBookmark(db, b.id),
      },
    ],
  });
}

export function BookmarkRow({ item, showEpisode }: { item: BookmarkItem; showEpisode: boolean }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => void playEpisodeAt(db, item.episode_id, item.position_s)}
      onLongPress={() => bookmarkMenu(db, item)}
      accessibilityRole="button"
      accessibilityHint="Plays from this moment. Long-press for options."
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
        pressed && { opacity: 0.7 },
      ]}>
      {showEpisode && (
        <Artwork uri={item.artwork} title={item.podcast_title} size={48} radius={10} />
      )}
      <View style={styles.text}>
        {showEpisode && (
          <Txt variant="meta" secondary numberOfLines={1}>
            {item.podcast_title}
          </Txt>
        )}
        <Txt variant="bodyBold" numberOfLines={2}>
          {item.title}
        </Txt>
        {!!item.transcript_passage && (
          <Txt variant="small" secondary numberOfLines={2} style={styles.passage}>
            “{item.transcript_passage}”
          </Txt>
        )}
        <Txt variant="small" secondary numberOfLines={1}>
          {clock(item.position_s * 1000)}
          {showEpisode ? ` · ${item.episode_title}` : ` · ${releaseDate(item.created_at)}`}
        </Txt>
      </View>
      <IconButton
        icon="dots-three-vertical"
        size={20}
        label="Bookmark options"
        onPress={() => bookmarkMenu(db, item)}
        hitSlop={4}
      />
    </Pressable>
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
  text: { flex: 1, gap: 3 },
  passage: { fontStyle: 'italic' },
});
