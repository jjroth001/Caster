import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/controls';
import { NavRow, PickerRow, RowDivider, SettingRow } from '@/components/picker-row';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS, type Settings } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import {
  clearDownloadErrors,
  PLAYLIST_DOWNLOADS,
  runAutoDownloads,
  stopAllDownloads,
} from '@/downloads/auto-download';
import { writeBackgroundConfig } from '@/downloads/background';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="meta" secondary style={styles.sectionTitle}>
        {title}
      </Txt>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Everything Caster downloads by itself, and when it's allowed to. */
export default function AutoDownloadScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const s = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const chosenPodcasts =
    useDbQuery(['podcast', 'podcast_settings'], (d) =>
      d.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM podcast p JOIN podcast_settings ps ON ps.podcast_id = p.id
         WHERE p.subscribed = 1 AND ps.auto_download_n > 0`,
      ),
    ).data?.n ?? 0;
  const playlistIds =
    useDbQuery(['playlist'], (d) => d.getAllAsync<{ id: number }>('SELECT id FROM playlist'))
      .data ?? [];
  const chosenPlaylists = s.autoDownloadPlaylists.filter((id) =>
    playlistIds.some((p) => p.id === id),
  ).length;

  // Every change here can start (or stop needing) downloads, now and in the background check.
  const set =
    <K extends keyof Settings>(key: K) =>
    async (value: Settings[K]) => {
      await setSetting(key, value);
      await writeBackgroundConfig(db);
      await runAutoDownloads(db);
    };

  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: theme.accent, false: theme.track }}
      thumbColor={theme.dark ? '#ddd' : '#fff'}
    />
  );

  return (
    <SubScreen title="Auto-download">
      <ScrollView contentContainerStyle={{ paddingTop: Spacing.two, paddingBottom: tabSpace }}>
        <Section title="Up Next">
          <SettingRow label="Episodes added to Up Next">
            {toggle(s.autoDownloadUpNext, set('autoDownloadUpNext'))}
          </SettingRow>
        </Section>

        <Section title="Podcasts">
          <SettingRow
            label="New episodes"
            hint="Download new episodes of the podcasts you choose as they come out, keeping only the latest few of each.">
            {toggle(s.autoDownloadNew, set('autoDownloadNew'))}
          </SettingRow>
          <RowDivider />
          <NavRow
            label="Choose podcasts"
            value={count(chosenPodcasts, 'podcast', 'podcasts')}
            onPress={() => router.push('/auto-download-choose?kind=podcasts')}
          />
          <RowDivider />
          <PickerRow
            label="Limit downloads"
            hint="Older automatic downloads are removed, unless they're in Up Next, half-listened or starred"
            options={[1, 2, 3, 5, 10].map((n) => ({
              value: n,
              label: n === 1 ? 'Latest episode' : `${n} latest episodes`,
            }))}
            value={s.autoDownloadLimit}
            onChange={set('autoDownloadLimit')}
          />
          <RowDivider />
          <SettingRow label="When you follow a podcast" hint="Download its latest two episodes.">
            {toggle(s.autoDownloadOnFollow, set('autoDownloadOnFollow'))}
          </SettingRow>
        </Section>

        <Section title="Playlists">
          <NavRow
            label="Choose playlists"
            hint={`The first ${PLAYLIST_DOWNLOADS} unplayed episodes of each`}
            value={count(chosenPlaylists, 'playlist', 'playlists')}
            onPress={() => router.push('/auto-download-choose?kind=playlists')}
          />
        </Section>

        <Section title="When to download">
          <SettingRow
            label="Only on Wi-Fi"
            hint="When off, automatic downloads also use mobile data and other metered networks.">
            {toggle(s.downloadWifiOnly, set('downloadWifiOnly'))}
          </SettingRow>
          <RowDivider />
          <SettingRow
            label="Only while charging"
            hint="When off, automatic downloads don't wait for the charger.">
            {toggle(s.downloadChargingOnly, set('downloadChargingOnly'))}
          </SettingRow>
          <RowDivider />
          <SettingRow
            label="Only with enough storage"
            hint="When off, automatic downloads go ahead even when the phone is low on space.">
            {toggle(s.downloadStorageNotLow, set('downloadStorageNotLow'))}
          </SettingRow>
        </Section>
        <Txt variant="small" secondary style={styles.note}>
          Downloads you start yourself always go ahead straight away. Changes apply to downloads
          that start from now on.
        </Txt>

        <Section title="Downloads">
          <NavRow
            label="Stop all downloads"
            chevron={false}
            onPress={() =>
              void stopAllDownloads(db).then((n) =>
                Alert.alert(
                  n ? `Stopped ${count(n, 'download', 'downloads')}` : 'Nothing is downloading',
                ),
              )
            }
          />
          <RowDivider />
          <NavRow
            label="Clear download errors"
            chevron={false}
            onPress={() =>
              void clearDownloadErrors(db).then((n) =>
                Alert.alert(n ? `Cleared ${count(n, 'error', 'errors')}` : 'No download errors'),
              )
            }
          />
        </Section>
      </ScrollView>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  sectionTitle: { marginLeft: Spacing.two, marginBottom: Spacing.two },
  card: { paddingVertical: Spacing.one, overflow: 'hidden' },
  note: { marginHorizontal: Spacing.four, marginTop: -Spacing.two, marginBottom: Spacing.four },
});
