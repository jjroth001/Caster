import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Chip } from '@/components/controls';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import {
  getPodcast,
  getPodcastSettings,
  setPodcastSetting,
  type PodcastSettings,
} from '@/db/library';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useDbQuery } from '@/db/use-db-query';
import { useSettings } from '@/db/use-settings';
import { writeBackgroundConfig } from '@/downloads/background';
import { downloadsAvailable } from '@/downloads/downloads';
import { speedLabel } from '@/lib/format';
import { engine } from '@/player/engine';
import { Spacing } from '@/theme/themes';

type Option<T> = { value: T; label: string };

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
    <View style={styles.setting}>
      <Txt variant="bodyBold">{label}</Txt>
      {!!hint && (
        <Txt variant="small" secondary>
          {hint}
        </Txt>
      )}
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            selected={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Txt variant="meta" secondary style={styles.groupTitle}>
        {title}
      </Txt>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const SECONDS = [0, 10, 15, 30, 45, 60, 90, 120];

/** Settings for one podcast. "Default" means the global setting applies. */
export default function PodcastSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const podcastId = Number(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const global = useSettings().data ?? DEFAULT_SETTINGS;
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
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.five }}>
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
            options={SECONDS.map((v) => ({ value: v, label: v ? `${v} s` : 'Off' }))}
            value={own.skip_start_s ?? 0}
            onChange={(v) => void set('skip_start_s')(v || null)}
          />
          <Setting
            label="Skip outro"
            hint="Finish this long before the end"
            options={SECONDS.map((v) => ({ value: v, label: v ? `${v} s` : 'Off' }))}
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
              options={[
                {
                  value: null,
                  label: def(global.autoDownload ? `Newest ${global.autoDownload}` : 'Off'),
                },
                { value: 0, label: 'Off' },
                { value: 1, label: 'Newest 1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 5, label: '5' },
              ]}
              value={own.auto_download_n}
              onChange={set('auto_download_n')}
            />
          )}
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
  card: { paddingVertical: Spacing.two },
  setting: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: 6 },
});
