import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Background } from '@/components/background';
import { useArtworkTint } from '@/theme/artwork-tint';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { Button, IconButton } from '@/components/controls';
import { EpisodeRow } from '@/components/episode-row';
import { showSignIn } from '@/components/sign-in-sheet';
import { Icon } from '@/components/icons/icon';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import {
  followPodcast,
  getPodcast,
  getPodcastSettings,
  listEpisodes,
  setPodcastSetting,
} from '@/db/library';
import { useDbQuery } from '@/db/use-db-query';
import { autoDownloadFollowed } from '@/downloads/auto-download';
import { htmlToText } from '@/feeds/text';
import { NEEDS_LOGIN } from '@/feeds/parse-feed';
import { rememberFeedLogin } from '@/feeds/private';
import { refreshPodcast } from '@/feeds/sync';
import { podcastMenu } from '@/lib/library-actions';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

export default function PodcastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const podcastId = Number(id);
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const own = useDbQuery(['podcast_settings'], (d) => getPodcastSettings(d, podcastId), [
    podcastId,
  ]).data;
  const order: 'newest' | 'oldest' = own?.episode_sort === 'oldest' ? 'oldest' : 'newest';
  const [expanded, setExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const podcast = useDbQuery(
    ['podcast', 'episode', 'episode_state'],
    (d) => getPodcast(d, podcastId),
    [podcastId],
  ).data;
  const episodes = useDbQuery(
    ['episode', 'episode_state'],
    (d) => listEpisodes(d, podcastId, order),
    [podcastId, order],
  ).data;

  const tint = useArtworkTint(podcast?.artwork_url);

  if (!podcast) {
    return <Background />;
  }
  const following = !!podcast.subscribed;
  const description = htmlToText(podcast.description);
  const cards = theme.name !== 'paper';

  const menu = () => podcastMenu(db, podcast);
  const archivedCount = (episodes ?? []).filter((e) => e.archived).length;
  const shown = showArchived ? (episodes ?? []) : (episodes ?? []).filter((e) => !e.archived);

  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.two }]}>
        <IconButton icon="caret-left" label="Back" onPress={() => router.back()} />
        <View style={styles.flex} />
        <IconButton
          icon="gear"
          label="Podcast settings"
          onPress={() => router.push(`/podcast-settings/${podcastId}`)}
        />
        <IconButton icon="dots-three-vertical" label="More options" onPress={menu} />
      </View>
      <View style={styles.hero}>
        <Artwork uri={podcast.artwork_url} title={podcast.title} size={156} radius={20} />
        <Txt variant="title" style={styles.title} numberOfLines={3} accessibilityRole="header">
          {podcast.title}
        </Txt>
        {!!podcast.author && (
          <Txt secondary style={styles.centerText} numberOfLines={1}>
            {podcast.author}
          </Txt>
        )}
        {following ? (
          <Pressable
            onPress={menu}
            accessibilityRole="button"
            accessibilityLabel="Following. Opens options, including unfollow."
            style={[
              styles.following,
              { borderColor: theme.cardBorder, backgroundColor: theme.element },
            ]}>
            <Icon name="check" size={16} color={theme.accent} duotone={false} />
            <Txt variant="smallBold">Following</Txt>
          </Pressable>
        ) : (
          <Button
            label="Follow"
            icon="plus"
            onPress={() =>
              void followPodcast(db, podcastId).then(() => autoDownloadFollowed(db, podcastId))
            }
            style={styles.follow}
          />
        )}
      </View>
      {!!description && (
        <Pressable
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityHint="Shows the full description">
          <Txt
            variant="small"
            secondary
            numberOfLines={expanded ? undefined : 3}
            style={styles.description}>
            {description}
          </Txt>
        </Pressable>
      )}
      {podcast.refresh_error === NEEDS_LOGIN ? (
        <View style={[styles.description, styles.signIn]}>
          <Txt variant="small" color={theme.danger} style={styles.signInText}>
            {NEEDS_LOGIN}
          </Txt>
          <Button
            label="Sign in"
            kind="secondary"
            onPress={() =>
              showSignIn(
                podcast.title,
                (login) =>
                  void rememberFeedLogin(db, podcast.feed_url, login).then(() =>
                    refreshPodcast(db, podcastId),
                  ),
              )
            }
          />
        </View>
      ) : (
        !!podcast.refresh_error && (
          <Txt variant="small" color={theme.danger} style={styles.description}>
            Last check failed: {podcast.refresh_error}
          </Txt>
        )
      )}
      <View style={styles.listHeader}>
        <Txt variant="bodyBold">
          {podcast.new_count ? `${podcast.new_count} new` : `${shown.length} episodes`}
        </Txt>
        <Pressable
          onPress={() =>
            void setPodcastSetting(
              db,
              podcastId,
              'episode_sort',
              order === 'newest' ? 'oldest' : null,
            )
          }
          accessibilityRole="button"
          hitSlop={10}>
          <Txt variant="small" secondary>
            {order === 'newest' ? 'Newest first' : 'Oldest first'}
          </Txt>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <Background tint={tint} />
      <FlatList
        data={shown}
        keyExtractor={(e) => String(e.id)}
        renderItem={({ item }) => <EpisodeRow episode={item} cards={cards} />}
        ListHeaderComponent={header}
        ListFooterComponent={
          archivedCount > 0 ? (
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              accessibilityRole="button"
              style={styles.archivedToggle}>
              <Txt variant="smallBold" color={theme.accent}>
                {showArchived
                  ? 'Hide archived episodes'
                  : `Show ${archivedCount} archived episode${archivedCount === 1 ? '' : 's'}`}
              </Txt>
            </Pressable>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        initialNumToRender={12}
        windowSize={11}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[theme.accent]}
            progressViewOffset={insets.top}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshPodcast(db, podcastId).finally(() => setRefreshing(false));
            }}
          />
        }
      />
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.two },
  hero: { alignItems: 'center', paddingHorizontal: Spacing.four, gap: Spacing.two },
  title: { textAlign: 'center', fontSize: 28, lineHeight: 34, marginTop: Spacing.two },
  centerText: { textAlign: 'center' },
  following: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  follow: { marginTop: Spacing.two },
  description: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  archivedToggle: { alignItems: 'center', paddingVertical: Spacing.four },
  signInText: { flex: 1 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
});
