import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookmarkRow } from '@/components/bookmark-row';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { listBookmarks } from '@/db/bookmarks';
import { useDbQuery } from '@/db/use-db-query';
import { Spacing } from '@/theme/themes';

export default function BookmarksScreen() {
  const insets = useSafeAreaInsets();
  const bookmarks = useDbQuery(['bookmark', 'episode'], (d) => listBookmarks(d)).data ?? [];
  return (
    <SubScreen title="Bookmarks">
      <FlatList
        data={bookmarks}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}
        renderItem={({ item }) => <BookmarkRow item={item} showEpisode />}
        ListEmptyComponent={
          <Txt secondary style={styles.empty}>
            No bookmarks yet. Tap the bookmark button in the player to save a moment, or set a
            headphone double-press to do it in Settings.
          </Txt>
        }
      />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  empty: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
