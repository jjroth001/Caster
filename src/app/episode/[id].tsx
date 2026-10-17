import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Background } from '@/components/background';
import { Button, IconButton } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { dequeue, getEpisode, queueEpisode, setPlayed, setStarred } from '@/db/library';
import { useDbQuery } from '@/db/use-db-query';
import { htmlToText } from '@/feeds/text';
import { duration, releaseDate, timeLeft } from '@/lib/format';
import { playEpisode } from '@/player/controller';
import { engine } from '@/player/engine';
import { usePlayerState } from '@/player/use-player';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.element },
        pressed && { opacity: 0.6 },
      ]}>
      <Icon name={icon} size={22} color={theme.text} />
      <Txt variant="small" style={styles.actionLabel} numberOfLines={1}>
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
          paddingBottom: insets.bottom + Spacing.five,
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
            if (current) void (playing ? engine.pause() : engine.play());
            else void playEpisode(db, episode.id);
          }}
          style={styles.play}
        />

        <View style={styles.actions}>
          {queued ? (
            <Action
              icon="x"
              label="Remove from Up Next"
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
          <Action
            icon={episode.played ? 'arrow-counter-clockwise' : 'check-circle'}
            label={episode.played ? 'Mark unplayed' : 'Mark played'}
            onPress={() => void setPlayed(db, episode.id, !episode.played)}
          />
          <Action
            icon={episode.starred ? 'star-fill' : 'star'}
            label={episode.starred ? 'Starred' : 'Star'}
            onPress={() => void setStarred(db, episode.id, !episode.starred)}
          />
          <Action icon="share-network" label="Share" onPress={share} />
        </View>

        {!!notes && (
          <Txt selectable style={styles.notes}>
            {notes}
          </Txt>
        )}
        {!!episode.link && (
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
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.three,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  actionLabel: { fontWeight: '600' },
  notes: { marginHorizontal: Spacing.four, marginTop: Spacing.four, lineHeight: 24 },
  link: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
