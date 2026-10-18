import { useSQLiteContext } from 'expo-sqlite';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useFingerprintStatus, type FingerprintStatus } from '@/ads/repeats';
import { AD_THRESHOLDS } from '@/ads/thresholds';
import { RowDivider } from '@/components/picker-row';
import { closeSheet, showCustomSheet } from '@/components/sheet';
import { Txt } from '@/components/text';
import { getSettings } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { clock } from '@/lib/format';
import { isAdTitle } from '@/player/chapters';
import { optionsFor, refreshSkipRules } from '@/player/controller';
import { engine } from '@/player/engine';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

type Episode = {
  id: number;
  podcast_id: number;
  guid: string;
  local_path: string | null;
};

type Ad = {
  kind: 'segment' | 'chapter';
  id: number;
  start: number;
  end: number;
  source: string;
  skipped: boolean;
};

const FINGERPRINT_TEXT: Record<FingerprintStatus, string> = {
  done: 'Audio fingerprint made: ads it shares with your other downloads are found.',
  working: 'Making the audio fingerprint now…',
  waiting: 'The audio fingerprint is waiting its turn.',
  failed: 'Couldn’t make an audio fingerprint from this file.',
  'needs-download':
    'Download this episode to make an audio fingerprint and find ads it shares with others.',
};

async function loadAds(
  db: Parameters<typeof getSettings>[0],
  episode: Episode,
): Promise<{ ads: Ad[]; skipping: boolean }> {
  const [settings, options] = await Promise.all([
    getSettings(db),
    optionsFor(db, episode.podcast_id),
  ]);
  const threshold = AD_THRESHOLDS[settings.adSensitivity];
  const segments = await db.getAllAsync<{
    id: number;
    start_s: number;
    end_s: number;
    layer: number;
    confidence: number;
    user_verdict: string | null;
  }>(
    'SELECT id, start_s, end_s, layer, confidence, user_verdict FROM ad_segment WHERE episode_id = ?',
    episode.id,
  );
  // Chapters you unticked, and ones titled like ads (skipped or not), so the switch can flip them.
  const chapters = (
    await db.getAllAsync<{
      rowid: number;
      start_s: number;
      end_s: number | null;
      title: string | null;
      selected: number;
    }>(
      `SELECT rowid, start_s, end_s, title, selected FROM chapter
       WHERE episode_id = ? AND end_s IS NOT NULL`,
      episode.id,
    )
  ).filter((c) => c.selected === 0 || isAdTitle(c.title, settings.adKeywords));
  const ads: Ad[] = [
    ...segments.map((s) => ({
      kind: 'segment' as const,
      id: s.id,
      start: s.start_s,
      end: s.end_s,
      source:
        s.user_verdict === 'ad' && s.confidence >= 1
          ? 'Marked by you'
          : s.layer === 4
            ? 'Found in the transcript'
            : 'Repeats in other episodes',
      skipped: (s.user_verdict ?? (s.confidence >= threshold ? 'ad' : null)) === 'ad',
    })),
    ...chapters.map((c) => ({
      kind: 'chapter' as const,
      id: c.rowid,
      start: c.start_s,
      end: c.end_s ?? c.start_s,
      source: c.title ? `Chapter “${c.title}”` : 'Chapter',
      skipped: c.selected === 0,
    })),
  ].sort((a, b) => a.start - b.start);
  return { ads, skipping: options.adSkip };
}

function AdsList({ episode }: { episode: Episode }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const fingerprint = useFingerprintStatus(episode, !!episode.local_path);
  const data = useDbQuery(
    ['ad_segment', 'chapter', 'podcast_settings', 'setting'],
    (d) => loadAds(d, episode),
    [episode.id],
  ).data;
  const ads = data?.ads ?? [];

  const setSkipped = async (ad: Ad, skip: boolean) => {
    if (ad.kind === 'segment') {
      await db.runAsync(
        'UPDATE ad_segment SET user_verdict = ? WHERE id = ?',
        skip ? 'ad' : 'not_ad',
        ad.id,
      );
    } else {
      await db.runAsync('UPDATE chapter SET selected = ? WHERE rowid = ?', skip ? 0 : 1, ad.id);
    }
    await refreshSkipRules(db);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
      {data && !data.skipping && (
        <Txt variant="small" color={theme.danger}>
          Ad skipping is off for this show, so nothing here is skipped.
        </Txt>
      )}
      {data && ads.length === 0 && (
        <Txt variant="small" secondary>
          No ads found yet. Caster looks in chapter titles, the transcript, and audio that repeats
          in your other downloads. Missed one? Use “That was an ad” in the player’s menu.
        </Txt>
      )}
      {ads.map((ad, i) => (
        <Fragment key={`${ad.kind}${ad.id}`}>
          {i > 0 && <RowDivider />}
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                closeSheet();
                void engine.seekTo(ad.start * 1000);
              }}
              accessibilityRole="button"
              accessibilityHint="Jumps there"
              style={styles.rowText}>
              <Txt variant="bodyBold">
                {clock(ad.start * 1000)} – {clock(ad.end * 1000)}
              </Txt>
              <Txt variant="small" secondary>
                {ad.source} ·{' '}
                {ad.skipped && data?.skipping ? 'skipped' : 'not skipped (shaded only)'}
              </Txt>
            </Pressable>
            <Switch
              value={ad.skipped}
              onValueChange={(v) => void setSkipped(ad, v)}
              accessibilityLabel="Skip this ad"
              trackColor={{ true: theme.accent, false: theme.track }}
              thumbColor={theme.dark ? '#ddd' : '#fff'}
            />
          </View>
        </Fragment>
      ))}
      {fingerprint && (
        <Txt variant="small" secondary style={styles.fingerprint}>
          {FINGERPRINT_TEXT[fingerprint]}
        </Txt>
      )}
    </ScrollView>
  );
}

/** Every ad found in an episode: when, how it was found, and whether it's skipped. */
export function showAdsSheet(episode: Episode) {
  showCustomSheet({
    title: 'Ads in this episode',
    message: 'Tap one to jump there; the switch decides whether it’s skipped.',
    content: <AdsList episode={episode} />,
  });
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 6 },
  rowText: { flex: 1, gap: 2 },
  fingerprint: { marginTop: Spacing.two },
});
