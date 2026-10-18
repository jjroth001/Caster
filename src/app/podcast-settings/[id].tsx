import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Children, Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/controls';
import { PickerRow, RowDivider } from '@/components/picker-row';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import {
  getPodcast,
  getPodcastSettings,
  setPodcastSetting,
  type PodcastSettings,
} from '@/db/library';
import { ARCHIVE_INACTIVE_OPTIONS, ARCHIVE_PLAYED_OPTIONS, runAutoArchive } from '@/db/archive';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { runAutoDownloads, setPodcastAutoDownload } from '@/downloads/auto-download';
import { writeBackgroundConfig } from '@/downloads/background';
import { downloadsAvailable } from '@/downloads/downloads';
import { speedLabel } from '@/lib/format';
import { engine } from '@/player/engine';
import { Spacing } from '@/theme/themes';

type Option<T> = { value: T; label: string; hint?: string };

/** One per-podcast setting: a row showing the current choice; tapping opens the choices. */
function Setting<T extends string | number | null>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <PickerRow label={label} hint={hint} options={options} value={value} onChange={onChange} />
  );
}

/** A card of settings with a thin line between each. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      <Txt variant="meta" secondary style={styles.groupTitle}>
        {title}
      </Txt>
      <Card style={styles.card}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <RowDivider />}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

const SECONDS = [0, 10, 15, 30, 45, 60, 90, 120];

/** Settings for one podcast. "Default" means the global setting applies. */
export default function PodcastSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const podcastId = Number(id);
  const db = useSQLiteContext();
  const tabSpace = useTabBarSpace();
  const global = useSettings().data ?? DEFAULT_SETTINGS;
  const setGlobal = useSetSetting();
  const podcast = useDbQuery(['podcast'], (d) => getPodcast(d, podcastId), [podcastId]).data;
  const own = useDbQuery(['podcast_settings'], (d) => getPodcastSettings(d, podcastId), [
    podcastId,
  ]).data;
  if (!own) return <SubScreen title="Podcast settings">{null}</SubScreen>;

  const set =
    <K extends keyof PodcastSettings>(key: K) =>
    async (value: PodcastSettings[K]) => {
      await setPodcastSetting(db, podcastId, key, value);
      if (key === 'notify' || key === 'auto_download_n') await writeBackgroundConfig(db);
    };
  const def = (label: string) => `Default (${label})`;
  const basic = engine.kind === 'basic';

  return (
    <SubScreen title={podcast?.title ?? 'Podcast settings'}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}>
        <Group title="Playback">
          <Setting
            label="Speed"
            options={[
              { value: null, label: def(speedLabel(global.speed)) },
              ...[0.8, 1, 1.2, 1.5, 1.7, 2, 2.5, 3]
                .filter((v) => !basic || v <= 2)
                .map((v) => ({ value: v, label: speedLabel(v) })),
            ]}
            value={own.speed}
            onChange={set('speed')}
          />
          {!basic && (
            <Setting
              label="Trim silence"
              options={[
                {
                  value: null,
                  label: def(
                    global.trimSilence === 'aggressive'
                      ? 'Strong'
                      : global.trimSilence === 'mild'
                        ? 'Mild'
                        : 'Off',
                  ),
                },
                { value: 'off', label: 'Off' },
                { value: 'mild', label: 'Mild' },
                { value: 'aggressive', label: 'Strong' },
              ]}
              value={own.trim_silence}
              onChange={set('trim_silence')}
            />
          )}
          {!basic && (
            <Setting
              label="Volume boost"
              options={[
                { value: null, label: def(global.volumeBoost ? 'On' : 'Off') },
                { value: 0, label: 'Off' },
                { value: 1, label: 'On' },
              ]}
              value={own.volume_boost}
              onChange={set('volume_boost')}
            />
          )}
          <Setting
            label="Skip intro"
            hint="Start every episode this far in"
            options={SECONDS.map((v) => ({ value: v, label: v ? `${v} seconds` : 'Off' }))}
            value={own.skip_start_s ?? 0}
            onChange={(v) => void set('skip_start_s')(v || null)}
          />
          <Setting
            label="Skip outro"
            hint="Finish this long before the end"
            options={SECONDS.map((v) => ({ value: v, label: v ? `${v} seconds` : 'Off' }))}
            value={own.skip_end_s ?? 0}
            onChange={(v) => void set('skip_end_s')(v || null)}
          />
          <Setting
            label="Skip ads"
            hint="Chapters titled like ads, and ad reads found in transcripts"
            options={[
              { value: null, label: def(global.adSkip ? 'On' : 'Off') },
              { value: 1, label: 'On' },
              { value: 0, label: 'Off' },
            ]}
            value={own.ad_skip_enabled}
            onChange={set('ad_skip_enabled')}
          />
        </Group>

        <Group title="New episodes">
          {downloadsAvailable && (
            <Setting
              label="Auto-download"
              hint={
                own.auto_download_n
                  ? `New episodes, keeping the latest ${global.autoDownloadLimit}. Change the limit in Settings → Auto-download.`
                  : 'Download new episodes as they come out'
              }
              options={[
                { value: 0, label: 'Off' },
                { value: 1, label: 'On' },
              ]}
              value={own.auto_download_n ? 1 : 0}
              onChange={(v) =>
                void (async () => {
                  await setPodcastAutoDownload(db, podcastId, v === 1);
                  if (v === 1 && !global.autoDownloadNew) {
                    await setGlobal('autoDownloadNew', true);
                  }
                  await writeBackgroundConfig(db);
                  await runAutoDownloads(db);
                })()
              }
            />
          )}
          <Setting
            label="Add to Up Next"
            hint={
              own.up_next_auto
                ? `New episodes join Up Next, until it has ${global.upNextLimit}`
                : 'Add new episodes to Up Next as they come out'
            }
            options={[
              { value: null, label: 'Off' },
              { value: 'top', label: 'To the top', hint: 'They play next' },
              { value: 'bottom', label: 'To the bottom', hint: 'They play after the rest' },
            ]}
            value={own.up_next_auto}
            onChange={set('up_next_auto')}
          />
          <Setting
            label="Notifications"
            options={[
              { value: null, label: def(global.notifyNewEpisodes ? 'On' : 'Off') },
              { value: 1, label: 'On' },
              { value: 0, label: 'Off' },
            ]}
            value={own.notify}
            onChange={set('notify')}
          />
          <Setting
            label="Archive played episodes"
            options={[
              {
                value: null,
                label: def(
                  ARCHIVE_PLAYED_OPTIONS.find((o) => o.value === global.autoArchivePlayed)?.label ??
                    'Never',
                ),
              },
              ...ARCHIVE_PLAYED_OPTIONS,
            ]}
            value={own.archive_played_h}
            onChange={(v) => void set('archive_played_h')(v).then(() => runAutoArchive(db))}
          />
          <Setting
            label="Archive unstarted episodes"
            options={[
              {
                value: null,
                label: def(
                  ARCHIVE_INACTIVE_OPTIONS.find((o) => o.value === global.autoArchiveInactive)
                    ?.label ?? 'Never',
                ),
              },
              ...ARCHIVE_INACTIVE_OPTIONS,
            ]}
            value={own.archive_inactive_h}
            onChange={(v) => void set('archive_inactive_h')(v).then(() => runAutoArchive(db))}
          />
          <Setting
            label="Episode order"
            options={[
              { value: null, label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
            ]}
            value={own.episode_sort}
            onChange={set('episode_sort')}
          />
        </Group>
      </ScrollView>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  groupTitle: { marginLeft: Spacing.two, marginBottom: Spacing.two },
  card: { paddingVertical: Spacing.one, overflow: 'hidden' },
});
