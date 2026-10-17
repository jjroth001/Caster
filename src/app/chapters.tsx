import { useSQLiteContext } from 'expo-sqlite';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Icon } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { useDbQuery } from '@/db/use-db-query';
import { clock } from '@/lib/format';
import { chapterAt, listChapters, setChapterSelected } from '@/player/chapters';
import { engine } from '@/player/engine';
import { useNowPlaying } from '@/player/use-now-playing';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

/** The playing episode's chapters: tap to jump, untick to skip (Preselect Chapters). */
export default function ChaptersScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const episode = useNowPlaying();
  const player = usePlayerState();
  const chapters =
    useDbQuery(['chapter'], async (d) => (episode ? listChapters(d, episode.id) : []), [
      episode?.id,
    ]).data ?? [];
  const current = chapterAt(chapters, player.positionMs / 1000)?.index ?? -1;
  const skipped = chapters.filter((c) => !c.selected).length;

  return (
    <SubScreen title="Chapters">
      <FlatList
        data={chapters}
        keyExtractor={(c) => String(c.start_s)}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}
        ListHeaderComponent={
          <Txt variant="small" secondary style={styles.hint}>
            Tap a chapter to jump to it. Untick chapters to skip them
            {skipped ? ` (${skipped} skipped)` : ''}. Chapters that look like ads are unticked for
            you.
          </Txt>
        }
        renderItem={({ item, index }) => {
          const playing = index === current;
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: playing ? theme.element : 'transparent' },
                !item.selected && { opacity: 0.55 },
              ]}>
              <Pressable
                onPress={() => void engine.seekTo(item.start_s * 1000 + 1)}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${item.title ?? `chapter ${index + 1}`}`}
                style={styles.main}>
                {item.image_url ? (
                  <Artwork uri={item.image_url} title={item.title ?? ''} size={44} radius={8} />
                ) : (
                  <View style={[styles.number, { backgroundColor: theme.element }]}>
                    <Txt variant="smallBold">{index + 1}</Txt>
                  </View>
                )}
                <View style={styles.text}>
                  <Txt
                    variant="bodyBold"
                    numberOfLines={2}
                    color={playing ? theme.accent : undefined}>
                    {item.title ?? `Chapter ${index + 1}`}
                  </Txt>
                  <Txt variant="small" secondary>
                    {clock(item.start_s * 1000)}
                    {item.end_s
                      ? ` · ${Math.max(1, Math.round((item.end_s - item.start_s) / 60))} min`
                      : ''}
                  </Txt>
                </View>
              </Pressable>
              <Pressable
                onPress={() =>
                  episode && void setChapterSelected(db, episode.id, item.start_s, !item.selected)
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!item.selected }}
                accessibilityLabel={item.selected ? 'Play this chapter' : 'Skip this chapter'}
                hitSlop={10}
                style={[
                  styles.check,
                  { borderColor: item.selected ? theme.accent : theme.textSecondary },
                  !!item.selected && { backgroundColor: theme.accent },
                ]}>
                {!!item.selected && (
                  <Icon name="check" size={16} color={theme.onAccent} duotone={false} />
                )}
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <Txt secondary style={styles.hint}>
            This episode has no chapters.
          </Txt>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  hint: { marginHorizontal: Spacing.four, marginBottom: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
    borderRadius: Radius.medium,
    gap: Spacing.three,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  number: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.two,
  },
});
