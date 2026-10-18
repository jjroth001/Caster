import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Icon } from '@/components/icons/icon';
import { ScreenHeader } from '@/components/screen-header';
import { showSheet } from '@/components/sheet';
import { showKeyForm, showSignIn } from '@/components/sign-in-sheet';
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
import { splitLogin } from '@/feeds/credentials';
import { FeedAuthError } from '@/feeds/parse-feed';
import {
  forgetPodcastIndexLogin,
  getPodcastIndexLogin,
  mergeResults,
  savePodcastIndexLogin,
  searchPodcastIndex,
  trendingPodcastIndex,
} from '@/feeds/podcast-index';
import { rememberFeedLogin } from '@/feeds/private';
import { openFeed } from '@/feeds/sync';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

/** The phone's language ("en"), for Podcast Index's trending list. */
function language(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/)[0] || 'en';
  } catch {
    return 'en';
  }
}

/** How long after the last keystroke the search runs. */
const TYPING_PAUSE_MS = 500;

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
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSearch = useRef(0);
  const [indexKey, setIndexKey] = useState(false);
  const [source, setSource] = useState<'apple' | 'podcastindex'>('apple');
  const country = deviceCountry();

  useEffect(() => {
    void getPodcastIndexLogin().then((login) => setIndexKey(!!login));
  }, []);

  useEffect(() => {
    let live = true;
    const load =
      source === 'podcastindex' ? trendingPodcastIndex(language()) : topPodcasts(country);
    load.then(
      (items) => live && setCharts(items),
      () => live && setCharts([]),
    );
    return () => {
      live = false;
    };
  }, [country, source]);

  const chooseSource = () =>
    showSheet({
      title: 'Show',
      choice: true,
      options: [
        { label: 'Top shows on Apple Podcasts', value: 'apple' as const },
        { label: 'Trending on Podcast Index', value: 'podcastindex' as const },
      ].map((o) => ({
        label: o.label,
        selected: source === o.value,
        onPress: () => {
          if (o.value === source) return;
          setCharts(null);
          setSource(o.value);
        },
      })),
    });

  const addIndexKey = () =>
    showKeyForm(
      'Podcast Index',
      'Podcast Index is the open podcast directory. Get a free API key at api.podcastindex.org, then paste the key and secret here to add its search results and trending shows.',
      {
        user: 'API key',
        password: 'API secret',
        note: 'Kept encrypted on this phone and sent only to Podcast Index.',
        confirm: 'Add',
      },
      ({ first, second }) =>
        void savePodcastIndexLogin({ key: first, secret: second }).then(
          () => setIndexKey(true),
          (e) => Alert.alert('Couldn’t add the key', e instanceof Error ? e.message : undefined),
        ),
    );

  const removeIndexKey = () =>
    Alert.alert('Remove the Podcast Index key?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void forgetPodcastIndexLogin().then(() => {
            setIndexKey(false);
            if (source === 'podcastindex') {
              setCharts(null);
              setSource('apple');
            }
          }),
      },
    ]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

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
      if (e instanceof FeedAuthError && feedUrl) {
        const { url: clean } = splitLogin(feedUrl);
        // Ask for the sign-in, then try again with it.
        showSignIn(
          'Sign in to this podcast',
          (login) => void rememberFeedLogin(db, clean, login).then(() => open(key, clean, appleId)),
        );
        return;
      }
      setError(e instanceof Error ? e.message : 'Couldn’t open this podcast.');
    } finally {
      setOpening(null);
    }
  };

  const search = async (term: string) => {
    clearTimeout(typingTimer.current);
    const request = ++latestSearch.current;
    setResults({ kind: 'loading' });
    try {
      // With a Podcast Index key, its results join Apple's (without repeats).
      const [apple, index] = await Promise.all([
        searchPodcasts(term, country),
        indexKey ? searchPodcastIndex(term).catch(() => []) : Promise.resolve([]),
      ]);
      const items = mergeResults(apple, index);
      // A slower, older search finishing late mustn't replace newer results.
      if (request === latestSearch.current) setResults({ kind: 'done', items });
    } catch (e) {
      if (request === latestSearch.current) {
        setResults({ kind: 'error', message: e instanceof Error ? e.message : 'Search failed.' });
      }
    }
  };

  const submit = async () => {
    const q = classifyQuery(query);
    if (q.kind === 'url') return open('url', q.url);
    if (q.kind === 'apple') return open('apple', null, q.id);
    if (!q.term) return;
    await search(q.term);
  };

  /** Searches by itself shortly after typing stops (links still wait for Go). */
  const onType = (text: string) => {
    setQuery(text);
    clearTimeout(typingTimer.current);
    const q = classifyQuery(text);
    if (!text.trim()) {
      latestSearch.current++;
      setResults({ kind: 'idle' });
      return;
    }
    if (q.kind === 'search' && q.term && q.term.length >= 2) {
      typingTimer.current = setTimeout(() => void search(q.term), TYPING_PAUSE_MS);
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
              onChangeText={onType}
              onSubmitEditing={submit}
              placeholder="Search, or paste a link"
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
          {searching || !indexKey ? (
            <Txt variant="meta" secondary style={styles.section}>
              {searching ? 'Results' : 'Top shows'}
            </Txt>
          ) : (
            <Pressable
              onPress={chooseSource}
              accessibilityRole="button"
              accessibilityHint="Choose where the list comes from"
              style={[styles.section, styles.sourceRow]}>
              <Txt variant="meta" color={theme.accent}>
                {source === 'podcastindex' ? 'Trending on Podcast Index' : 'Top shows on Apple'}
              </Txt>
              <Icon name="caret-down" size={14} color={theme.accent} duotone={false} />
            </Pressable>
          )}
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
        <View style={styles.footerBox}>
          <Txt variant="small" secondary style={styles.footer}>
            {indexKey
              ? 'Search and charts come from Apple’s public podcast directory and Podcast Index. Only your search words are sent.'
              : 'Search and charts come from Apple’s public podcast directory. Only your search words are sent.'}
          </Txt>
          <Pressable
            onPress={indexKey ? removeIndexKey : addIndexKey}
            accessibilityRole="button"
            hitSlop={8}>
            <Txt variant="smallBold" color={theme.accent} style={styles.footer}>
              {indexKey ? 'Remove the Podcast Index key' : 'Add Podcast Index (free key)'}
            </Txt>
          </Pressable>
        </View>
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
  footerBox: { marginTop: Spacing.four, gap: Spacing.three },
  footer: { marginHorizontal: Spacing.four, textAlign: 'center' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
