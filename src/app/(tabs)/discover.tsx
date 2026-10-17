import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Icon } from '@/components/icons/icon';
import { ScreenHeader } from '@/components/screen-header';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import {
  classifyQuery,
  deviceCountry,
  lookupPodcasts,
  searchPodcasts,
  topPodcasts,
  type DirectoryPodcast,
} from '@/feeds/apple';
import { openFeed } from '@/feeds/sync';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Results =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; items: DirectoryPodcast[] }
  | { kind: 'error'; message: string };

export default function DiscoverScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ kind: 'idle' });
  const [charts, setCharts] = useState<DirectoryPodcast[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = deviceCountry();

  useEffect(() => {
    topPodcasts(country).then(setCharts, () => setCharts([]));
  }, [country]);

  /** Loads the feed (without following) and opens the podcast's page. */
  const open = async (key: string, feedUrl: string | null, appleId?: string) => {
    setOpening(key);
    setError(null);
    try {
      let url = feedUrl;
      if (!url && appleId) url = (await lookupPodcasts([appleId]))[0]?.feedUrl ?? null;
      if (!url)
        throw new Error('This show doesn’t share a public feed, so it can’t be played here.');
      const id = await openFeed(db, url);
      router.push(`/podcast/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t open this podcast.');
    } finally {
      setOpening(null);
    }
  };

  const submit = async () => {
    const q = classifyQuery(query);
    if (q.kind === 'url') return open('url', q.url);
    if (q.kind === 'apple') return open('apple', null, q.id);
    if (!q.term) return;
    setResults({ kind: 'loading' });
    try {
      setResults({ kind: 'done', items: await searchPodcasts(q.term, country) });
    } catch (e) {
      setResults({ kind: 'error', message: e instanceof Error ? e.message : 'Search failed.' });
    }
  };

  const searching = results.kind !== 'idle';
  const list = results.kind === 'done' ? results.items : !searching ? (charts ?? []) : [];
  const kind = classifyQuery(query).kind;

  return (
    <FlatList
      data={list}
      keyExtractor={(p) => p.appleId}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}
      ListHeaderComponent={
        <View>
          <ScreenHeader title="Discover" />
          <View style={[styles.search, { backgroundColor: theme.element }]}>
            <Icon
              name={kind === 'search' ? 'magnifying-glass' : 'rss'}
              size={20}
              color={theme.textSecondary}
            />
            <TextInput
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                if (!t.trim()) setResults({ kind: 'idle' });
              }}
              onSubmitEditing={submit}
              placeholder="Search, or paste a feed or Apple Podcasts link"
              placeholderTextColor={theme.textSecondary}
              returnKeyType={kind === 'search' ? 'search' : 'go'}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
              accessibilityLabel="Search podcasts or paste a feed address"
            />
            {opening === 'url' || opening === 'apple' ? (
              <ActivityIndicator color={theme.accent} />
            ) : null}
          </View>
          {error && (
            <Txt variant="small" color={theme.danger} style={styles.message}>
              {error}
            </Txt>
          )}
          <Txt variant="meta" secondary style={styles.section}>
            {searching ? 'Results' : 'Top shows'}
          </Txt>
          {results.kind === 'loading' || (!searching && charts == null) ? (
            <ActivityIndicator color={theme.accent} style={styles.spinner} />
          ) : results.kind === 'error' ? (
            <Txt secondary style={styles.message}>
              {results.message}
            </Txt>
          ) : results.kind === 'done' && results.items.length === 0 ? (
            <Txt secondary style={styles.message}>
              Nothing found. Try other words, or paste the podcast’s feed address.
            </Txt>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => open(item.appleId, item.feedUrl, item.appleId)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} by ${item.author}`}
          style={({ pressed }) => [
            styles.row,
            { borderBottomColor: theme.cardBorder },
            pressed && { opacity: 0.7 },
          ]}>
          {!searching && (
            <Txt variant="smallBold" secondary style={styles.rank}>
              {index + 1}
            </Txt>
          )}
          <Artwork uri={item.artworkUrl} title={item.title} size={56} radius={10} />
          <View style={styles.rowText}>
            <Txt variant="bodyBold" numberOfLines={2}>
              {item.title}
            </Txt>
            <Txt variant="small" secondary numberOfLines={1}>
              {item.author}
            </Txt>
          </View>
          {opening === item.appleId ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Icon name="caret-right" size={18} color={theme.textSecondary} duotone={false} />
          )}
        </Pressable>
      )}
      ListFooterComponent={
        <Txt variant="small" secondary style={styles.footer}>
          Search and charts come from Apple’s public podcast directory. Only your search words are
          sent.
        </Txt>
      }
    />
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  section: { marginHorizontal: Spacing.four, marginTop: Spacing.four, marginBottom: Spacing.two },
  message: { marginHorizontal: Spacing.four, marginTop: Spacing.two },
  spinner: { marginTop: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: { width: 22, textAlign: 'center' },
  rowText: { flex: 1, gap: 2 },
  footer: { marginHorizontal: Spacing.four, marginTop: Spacing.four, textAlign: 'center' },
});
