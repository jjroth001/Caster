import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { FadingChip, FadingChips, ShowRow } from '@/components/show-row';
import { showKeyForm } from '@/components/sign-in-sheet';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { useDbQuery } from '@/db/use-db-query';
import {
  classifyQuery,
  deviceCountry,
  searchPodcasts,
  topInCategory,
  topPodcasts,
  withFeedUrls,
  type DirectoryPodcast,
} from '@/feeds/apple';
import { CATEGORIES, categoriesForYou } from '@/feeds/categories';
import {
  forgetPodcastIndexLogin,
  getPodcastIndexLogin,
  mergeResults,
  savePodcastIndexLogin,
  searchPodcastIndex,
  trendingPodcastIndex,
} from '@/feeds/podcast-index';
import { recommendedShows, type Recommendation } from '@/feeds/recommendations';
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

/** How long after the last keystroke the search runs, and the fewest letters worth it. */
const TYPING_PAUSE_MS = 800;
const MIN_LETTERS = 3;

/**
 * Searches made in the last 10 minutes, so retyping or going back never asks again (Apple's
 * directory turns away phones that search a lot in a short time).
 */
const CACHE_MS = 10 * 60_000;
const recentSearches = new Map<string, { at: number; items: DirectoryPodcast[] }>();

// --- Lists of shows: top shows, trending, and each category's top shows -------------------

/** "top", "trending" or "cat:" and Apple's category id. "foryou" is the page of rows. */
type ListKey = string;
const FOR_YOU = 'foryou';
/** Categories shown as rows on For you; the rest are a tap away in the chips. */
const ROWS_FOR_YOU = 5;
/** Shows in a row; See all has the rest. */
const PER_ROW = 20;

function listTitle(key: ListKey): string {
  if (key === 'top') return 'Top shows';
  if (key === 'trending') return 'Trending on Podcast Index';
  const category = CATEGORIES.find((c) => `cat:${c.id}` === key);
  return category ? `Top in ${category.title}` : '';
}

function loadList(key: ListKey, country: string): Promise<DirectoryPodcast[]> {
  if (key === 'top') return topPodcasts(country);
  if (key === 'trending') return trendingPodcastIndex(language());
  return topInCategory(country, key.slice('cat:'.length));
}

/** Lists are kept for half an hour, so coming back to Discover is instant. */
const LISTS_MS = 30 * 60_000;
const recentLists = new Map<string, { at: number; items: DirectoryPodcast[] }>();

function cachedList(cacheKey: string): DirectoryPodcast[] | null {
  const hit = recentLists.get(cacheKey);
  return hit && Date.now() - hit.at < LISTS_MS ? hit.items : null;
}

type ListState = { key: string; items: DirectoryPodcast[] | null; failed: boolean };

/**
 * A list of shows, loaded once and kept. With `withFeeds`, the feeds behind Apple's chart
 * entries are looked up too (one request for the whole list), so tapping one opens at once;
 * rows skip that, as a page of rows would otherwise ask Apple too often.
 */
function useList(key: ListKey | null, withFeeds: boolean) {
  const cacheKey = key ? `${key}|${deviceCountry()}` : null;
  const [state, setState] = useState<ListState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !cacheKey) return;
    let live = true;
    const hit = cachedList(cacheKey);
    const load = hit
      ? Promise.resolve(hit)
      : loadList(key, deviceCountry()).then((items) => {
          recentLists.set(cacheKey, { at: Date.now(), items });
          return items;
        });
    load.then(
      (items) => {
        if (!live) return;
        setState({ key: cacheKey, items, failed: false });
        if (withFeeds && items.some((p) => !p.feedUrl)) {
          withFeedUrls(items).then(
            (full) => {
              recentLists.set(cacheKey, { at: Date.now(), items: full });
              if (live) setState({ key: cacheKey, items: full, failed: false });
            },
            () => {},
          );
        }
      },
      () => live && setState({ key: cacheKey, items: [], failed: true }),
    );
    return () => {
      live = false;
    };
  }, [key, cacheKey, withFeeds, attempt]);

  const mine = state && state.key === cacheKey ? state : null;
  return {
    items: mine?.items ?? (cacheKey ? cachedList(cacheKey) : null),
    failed: mine?.failed ?? false,
    retry: () => {
      if (!cacheKey) return;
      recentLists.delete(cacheKey);
      setState({ key: cacheKey, items: null, failed: false });
      setAttempt((n) => n + 1);
    },
  };
}

/** Recommendations are worked out again at most every half hour. */
let recentRecommendations: { at: number; items: Recommendation[] } | null = null;

function freshRecommendations(): Recommendation[] | null {
  return recentRecommendations && Date.now() - recentRecommendations.at < LISTS_MS
    ? recentRecommendations.items
    : null;
}

function useRecommendations(active: boolean): Recommendation[] | null {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Recommendation[] | null>(freshRecommendations);
  useEffect(() => {
    if (!active || freshRecommendations()) return;
    let live = true;
    recommendedShows(db).then(
      (found) => {
        recentRecommendations = { at: Date.now(), items: found };
        if (live) setItems(found);
      },
      () => live && setItems([]),
    );
    return () => {
      live = false;
    };
  }, [db, active]);
  return items;
}

/** "Picked by Low Tide Radio and 2 others you follow". */
function pickedByNote(items: Recommendation[]): string {
  const names = [...new Set(items.flatMap((r) => r.pickedBy))];
  if (names.length === 0) return '';
  if (names.length === 1) return `Picked by ${names[0]}`;
  const others = names.length - 1;
  return `Picked by ${names[0]} and ${others} other${others === 1 ? '' : 's'} you follow`;
}

type Results =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; items: DirectoryPodcast[] }
  | { kind: 'error'; message: string };

type Entry =
  | { kind: 'show'; item: DirectoryPodcast; rank: number | null }
  | { kind: 'row'; key: ListKey }
  | { kind: 'recommended' };

export default function DiscoverScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ kind: 'idle' });
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSearch = useRef(0);
  const [indexKey, setIndexKey] = useState(false);
  const [chosen, setChosen] = useState<ListKey>(FOR_YOU);
  const country = deviceCountry();
  // The tab is drawn ahead of time; its lists wait until it's first opened, so they don't
  // compete with the app starting up.
  const [opened, setOpened] = useState(false);
  useFocusEffect(useCallback(() => setOpened(true), []));
  const list = useList(chosen === FOR_YOU ? null : chosen, true);
  const recommended = useRecommendations(opened);

  // The categories of the shows you follow put the matching rows and chips first.
  const followed =
    useDbQuery(['podcast'], (d) =>
      d.getAllAsync<{ categories: string | null }>(
        'SELECT categories FROM podcast WHERE subscribed = 1',
      ),
    ).data ?? [];
  const categories = categoriesForYou(
    followed.map((p) => {
      try {
        return JSON.parse(p.categories ?? '[]') as string[];
      } catch {
        return [];
      }
    }),
  );
  const chips: ListKey[] = [
    FOR_YOU,
    'top',
    ...(indexKey ? ['trending'] : []),
    ...categories.map((c) => `cat:${c.id}`),
  ];

  useEffect(() => {
    void getPodcastIndexLogin().then((login) => setIndexKey(!!login));
  }, []);

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
            if (chosen === 'trending') setChosen(FOR_YOU);
          }),
      },
    ]);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  /**
   * Opens the podcast's page at once, showing what the directory says about it; the page
   * loads the feed itself (without following), so a tap never waits on the download.
   */
  const open = (feedUrl: string | null, appleId?: string, show?: DirectoryPodcast) => {
    const params: Record<string, string> = { id: 'new' };
    if (feedUrl) params.feed = feedUrl;
    else if (appleId) params.appleId = appleId;
    if (show) {
      params.title = show.title;
      if (show.author) params.author = show.author;
      if (show.artworkUrl) params.art = show.artworkUrl;
    }
    router.push({ pathname: '/podcast/[id]', params: params as { id: string } });
  };
  const openShow = (item: DirectoryPodcast) => open(item.feedUrl, item.appleId, item);

  const search = async (term: string) => {
    clearTimeout(typingTimer.current);
    const request = ++latestSearch.current;
    const cacheKey = `${term.trim().toLowerCase()}|${indexKey}`;
    const cached = recentSearches.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setResults({ kind: 'done', items: cached.items });
      return;
    }
    setResults({ kind: 'loading' });
    try {
      // With a Podcast Index key, its results join Apple's (without repeats). When Apple is
      // busy, Podcast Index's results still show on their own.
      const [apple, index] = await Promise.allSettled([
        searchPodcasts(term, country),
        indexKey ? searchPodcastIndex(term) : Promise.resolve([]),
      ]);
      if (apple.status === 'rejected' && (index.status === 'rejected' || !indexKey)) {
        throw apple.reason;
      }
      const items = mergeResults(
        apple.status === 'fulfilled' ? apple.value : [],
        index.status === 'fulfilled' ? index.value : [],
      );
      recentSearches.set(cacheKey, { at: Date.now(), items });
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
    if (q.kind === 'url') return open(q.url);
    if (q.kind === 'apple') return open(null, q.id);
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
    if (q.kind === 'search' && q.term.length >= MIN_LETTERS) {
      typingTimer.current = setTimeout(() => void search(q.term), TYPING_PAUSE_MS);
    }
  };

  const searching = results.kind !== 'idle';
  const forYou = !searching && chosen === FOR_YOU;
  const entries: Entry[] = searching
    ? results.kind === 'done'
      ? results.items.map((item) => ({ kind: 'show', item, rank: null }))
      : []
    : forYou && !opened
      ? []
      : forYou
        ? [
            ...(recommended?.length ? [{ kind: 'recommended' as const }] : []),
            { kind: 'row', key: 'top' },
            ...(indexKey ? [{ kind: 'row' as const, key: 'trending' }] : []),
            ...categories
              .slice(0, ROWS_FOR_YOU)
              .map((c) => ({ kind: 'row' as const, key: `cat:${c.id}` })),
          ]
        : (list.items ?? []).map((item, i) => ({ kind: 'show', item, rank: i + 1 }));
  const kind = classifyQuery(query).kind;

  const chipLabel = (key: ListKey) =>
    key === FOR_YOU
      ? 'For you'
      : key === 'top'
        ? 'Top shows'
        : key === 'trending'
          ? 'Trending'
          : (CATEGORIES.find((c) => `cat:${c.id}` === key)?.title ?? '');

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) =>
        e.kind === 'show' ? `show:${e.item.appleId}` : e.kind === 'row' ? `row:${e.key}` : e.kind
      }
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}
      // Rows further down load their lists as you scroll to them.
      initialNumToRender={4}
      windowSize={5}
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
          </View>
          {searching ? (
            <Txt variant="meta" secondary style={styles.section}>
              Results
            </Txt>
          ) : (
            <FadingChips>
              {(fade) =>
                chips.map((key) => {
                  const on = key === chosen;
                  return (
                    <FadingChip key={key} fade={fade}>
                      <Pressable
                        onPress={() => setChosen(key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[
                          styles.chip,
                          { backgroundColor: on ? theme.accent : theme.element },
                        ]}>
                        <Txt variant="smallBold" color={on ? theme.onAccent : theme.text}>
                          {chipLabel(key)}
                        </Txt>
                      </Pressable>
                    </FadingChip>
                  );
                })
              }
            </FadingChips>
          )}
          {!searching && !forYou && (
            <Txt variant="meta" secondary style={styles.section}>
              {listTitle(chosen)}
            </Txt>
          )}
          {results.kind === 'loading' || (!searching && !forYou && list.items == null) ? (
            <ActivityIndicator color={theme.accent} style={styles.spinner} />
          ) : results.kind === 'error' ? (
            <Txt secondary style={styles.message}>
              {results.message}
            </Txt>
          ) : !searching && !forYou && list.failed ? (
            <Pressable
              onPress={list.retry}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.message}>
              <Txt secondary>Couldn’t load the list.</Txt>
              <Txt variant="bodyBold" color={theme.accent}>
                Try again
              </Txt>
            </Pressable>
          ) : results.kind === 'done' && results.items.length === 0 ? (
            <Txt secondary style={styles.message}>
              Nothing found. Try other words, or paste the podcast’s feed address.
            </Txt>
          ) : null}
        </View>
      }
      renderItem={({ item: entry }) => {
        if (entry.kind === 'recommended') {
          return (
            <ShowRow
              title="Recommended by your shows"
              note={pickedByNote(recommended ?? [])}
              items={recommended}
              onOpen={openShow}
            />
          );
        }
        if (entry.kind === 'row') {
          return (
            <ListRow listKey={entry.key} onSeeAll={() => setChosen(entry.key)} onOpen={openShow} />
          );
        }
        const { item, rank } = entry;
        return (
          <Pressable
            onPress={() => openShow(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} by ${item.author}`}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: theme.cardBorder },
              pressed && { opacity: 0.7 },
            ]}>
            {rank != null && (
              <Txt variant="smallBold" secondary style={styles.rank}>
                {rank}
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
            <Icon name="caret-right" size={18} color={theme.textSecondary} duotone={false} />
          </Pressable>
        );
      }}
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

/** One list as a row on For you; hidden if it can't be loaded. */
function ListRow({
  listKey,
  onSeeAll,
  onOpen,
}: {
  listKey: ListKey;
  onSeeAll: () => void;
  onOpen: (item: DirectoryPodcast) => void;
}) {
  const { items, failed } = useList(listKey, false);
  if (failed || items?.length === 0) return null;
  return (
    <ShowRow
      title={listTitle(listKey)}
      items={items ? items.slice(0, PER_ROW) : null}
      onSeeAll={onSeeAll}
      onOpen={onOpen}
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
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 9, borderRadius: Radius.pill },
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
  footerBox: { marginTop: Spacing.five, gap: Spacing.three },
  footer: { marginHorizontal: Spacing.four, textAlign: 'center' },
});
