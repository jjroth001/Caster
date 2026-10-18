import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { BookmarkRow } from '@/components/bookmark-row';
import { Background } from '@/components/background';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { Button, IconButton } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { useTabBarSpace } from '@/components/tab-bar';
import { showAdsSheet } from '@/components/ads-sheet';
import { showSheet } from '@/components/sheet';
import { Txt } from '@/components/text';
import {
  dequeue,
  getEpisode,
  queueEpisode,
  setArchived,
  setPlayed,
  setStarred,
} from '@/db/library';
import { listBookmarks } from '@/db/bookmarks';
import { useDbQuery } from '@/db/use-db-query';
import { downloadEpisode, downloadsAvailable, keyFor, removeDownload } from '@/downloads/downloads';
import { useDownloadLabel } from '@/downloads/progress';
import { htmlToText } from '@/feeds/text';
import { duration, releaseDate, timeLeft } from '@/lib/format';
import { chooseManualPlaylist } from '@/lib/library-actions';
import { playEpisode, togglePlay } from '@/player/controller';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

/** A round icon button with a short label underneath, like the player's controls. */
function Action({
  icon,
  label,
  onPress,
  active,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      <View style={[styles.actionCircle, { backgroundColor: theme.element }]}>
        <Icon name={icon} size={22} color={active ? theme.accent : theme.text} />
      </View>
      <Txt variant="small" secondary numberOfLines={1} style={styles.actionLabel}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function EpisodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const episodeId = Number(id);
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const player = usePlayerState();
  const episode = useDbQuery(['episode', 'episode_state'], (d) => getEpisode(d, episodeId), [
    episodeId,
  ]).data;
  const queued = useDbQuery(
    ['queue_item'],
    async (d) =>
      !!(await d.getFirstAsync('SELECT 1 FROM queue_item WHERE episode_id = ?', episodeId)),
    [episodeId],
  ).data;

  const bookmarks =
    useDbQuery(['bookmark'], (d) => listBookmarks(d, episodeId), [episodeId]).data ?? [];
  const downloadProgress = useDownloadLabel(episode ? keyFor(episode) : null);

  if (!episode) return <Background />;
  const current = player.id === String(episode.id);
  const playing = current && player.playWhenReady;
  const notes = htmlToText(episode.description);
  const meta = [releaseDate(episode.pub_date), duration(episode.duration_s)]
    .filter(Boolean)
    .join(' · ');
  const progress =
    !episode.played && episode.position_s > 5
      ? timeLeft(episode.position_s, episode.duration_s)
      : '';

  const downloadState = episode.download_status;
  const downloadShort =
    downloadState === 'done'
      ? 'Downloaded'
      : downloadState === 'downloading'
        ? (downloadProgress ?? '0%')
        : downloadState === 'queued'
          ? 'Waiting'
          : downloadState === 'failed'
            ? 'Retry'
            : 'Download';
  const onDownload = () => {
    if (downloadState === 'done') {
      showSheet({
        title: 'Downloaded',
        message: 'This episode plays from your phone, without the internet.',
        options: [
          {
            label: 'Remove download',
            icon: 'trash',
            destructive: true,
            onPress: () => void removeDownload(db, episode.id),
          },
        ],
      });
    } else if (downloadState === 'downloading' || downloadState === 'queued') {
      showSheet({
        title: downloadState === 'queued' ? 'Waiting to download' : 'Downloading',
        options: [
          {
            label: 'Cancel download',
            icon: 'x',
            destructive: true,
            onPress: () => void removeDownload(db, episode.id),
          },
        ],
      });
    } else {
      void downloadEpisode(db, episode.id);
    }
  };
  const more = () =>
    showSheet({
      title: episode.title,
      options: [
        {
          label: episode.played ? 'Mark as unplayed' : 'Mark as played',
          icon: episode.played ? 'arrow-counter-clockwise' : 'check-circle',
          onPress: () => void setPlayed(db, episode.id, !episode.played),
        },
        {
          label: 'Add to playlist',
          icon: 'playlist',
          onPress: () => void chooseManualPlaylist(db, episode.id),
        },
        {
          label: 'Ads in this episode',
          icon: 'scissors',
          onPress: () => showAdsSheet(episode),
        },
        {
          label: episode.archived ? 'Unarchive' : 'Archive',
          hint: episode.archived ? undefined : 'Hides it from the podcast’s episode list',
          icon: 'archive',
          onPress: () => void setArchived(db, episode.id, !episode.archived),
        },
        { label: 'Share', icon: 'share-network', onPress: share },
        {
          label: 'Go to podcast',
          icon: 'squares-four',
          onPress: () => router.replace(`/podcast/${episode.podcast_id}`),
        },
      ],
    });

  const isWebLink = (url: string) => /^https?:\/\//i.test(url.trim());

  const share = () => {
    const url = episode.link ?? episode.enclosure_url;
    void Share.share({ message: `${episode.title} (${episode.podcast_title})\n${url}` });
  };

  return (
    <View style={styles.flex}>
      <Background />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.two,
          paddingBottom: tabSpace + Spacing.two,
        }}>
        <View style={styles.topBar}>
          <IconButton icon="caret-down" label="Close" onPress={() => router.back()} />
        </View>
        <View style={styles.head}>
          <Artwork
            uri={episode.artwork_url ?? episode.podcast_artwork}
            title={episode.podcast_title}
            size={88}
            radius={14}
          />
          <View style={styles.headText}>
            <Pressable
              onPress={() => router.replace(`/podcast/${episode.podcast_id}`)}
              accessibilityRole="link">
              <Txt variant="meta" color={theme.accent} numberOfLines={1}>
                {episode.podcast_title}
              </Txt>
            </Pressable>
            <Txt variant="heading" numberOfLines={4} accessibilityRole="header">
              {episode.title}
            </Txt>
            <Txt variant="small" secondary>
              {[meta, episode.played ? 'Played' : progress].filter(Boolean).join(' · ')}
            </Txt>
          </View>
        </View>

        <Button
          label={playing ? 'Pause' : current ? 'Resume' : progress ? 'Resume' : 'Play'}
          icon={playing ? 'pause-fill' : 'play-fill'}
          onPress={() => {
            if (current) void togglePlay(db);
            else void playEpisode(db, episode.id);
          }}
          style={styles.play}
        />

        <View style={styles.actions}>
          {queued ? (
            <Action
              icon="x"
              label="In Up Next"
              active
              onPress={() => void dequeue(db, episode.id)}
            />
          ) : (
            <>
              <Action
                icon="list-plus"
                label="Play next"
                onPress={() => void queueEpisode(db, episode.id, 'next')}
              />
              <Action
                icon="queue"
                label="Play last"
                onPress={() => void queueEpisode(db, episode.id, 'last')}
              />
            </>
          )}
          {downloadsAvailable && (
            <Action
              icon={downloadState === 'failed' ? 'warning' : 'download-simple'}
              label={downloadShort}
              active={downloadState === 'done'}
              onPress={onDownload}
            />
          )}
          <Action
            icon={episode.starred ? 'star-fill' : 'star'}
            label={episode.starred ? 'Starred' : 'Star'}
            active={!!episode.starred}
            onPress={() => void setStarred(db, episode.id, !episode.starred)}
          />
          <Action icon="dots-three-vertical" label="More" onPress={more} />
        </View>

        {bookmarks.length > 0 && (
          <View style={styles.bookmarks}>
            <Txt variant="meta" secondary style={styles.bookmarksTitle}>
              Bookmarks
            </Txt>
            {bookmarks.map((b) => (
              <BookmarkRow key={b.id} item={b} showEpisode={false} />
            ))}
          </View>
        )}

        {!!notes && (
          <Txt selectable style={styles.notes}>
            {notes}
          </Txt>
        )}
        {/* Only web pages: a feed mustn't be able to open other apps' links from here. */}
        {!!episode.link && isWebLink(episode.link) && (
          <Pressable
            onPress={() => void Linking.openURL(episode.link!)}
            accessibilityRole="link"
            style={styles.link}>
            <Txt variant="smallBold" color={theme.accent}>
              Open the episode’s web page
            </Txt>
          </Pressable>
        )}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.two },
  head: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'flex-start',
  },
  headText: { flex: 1, gap: 4 },
  play: { marginHorizontal: Spacing.four, marginTop: Spacing.four },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.two,
    marginTop: Spacing.four,
  },
  action: { alignItems: 'center', gap: 6, width: 72 },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { textAlign: 'center' },
  bookmarks: { marginTop: Spacing.four },
  bookmarksTitle: { marginHorizontal: Spacing.four, marginBottom: Spacing.two },
  notes: { marginHorizontal: Spacing.four, marginTop: Spacing.four, lineHeight: 24 },
  link: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
