import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HeadsetAction } from '@modules/player-core/src';
import { Card, Chip } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { ScreenHeader } from '@/components/screen-header';
import { SpeechModels } from '@/components/speech-models';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS, type Settings } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { requestNotificationPermission, writeBackgroundConfig } from '@/downloads/background';
import { autoDownloadNew, downloadsAvailable, enforceStorageCap } from '@/downloads/downloads';
import { refreshAll } from '@/feeds/sync';
import {
  importOpml,
  restoreFromFile,
  shareBackup,
  shareOpml,
  type ImportProgress,
} from '@/lib/data-transfer';
import { releaseDate } from '@/lib/format';
import { applyPlayerSettings } from '@/player/controller';
import { engine } from '@/player/engine';
import { speechAvailable } from '@/transcripts/whisper';
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

function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary>
            {hint}
          </Txt>
        )}
      </View>
      {children}
    </View>
  );
}

function Choices<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={22} color={theme.accent} />
      <View style={styles.rowText}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary>
            {hint}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

const HEADSET_OPTIONS: { value: HeadsetAction; label: string }[] = [
  { value: 'skipForward', label: 'Skip forward' },
  { value: 'skipBack', label: 'Skip back' },
  { value: 'nextChapter', label: 'Next chapter' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'none', label: 'Nothing' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const s = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const [busy, setBusy] = useState<string | null>(null);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      void setSetting(key, value);
  const setPlayback =
    <K extends keyof Settings>(key: K) =>
    async (value: Settings[K]) => {
      await setSetting(key, value);
      await applyPlayerSettings(db);
    };

  // Settings the background check reads: save, then hand it a fresh snapshot.
  const setBackground =
    <K extends keyof Settings>(key: K) =>
    async (value: Settings[K]) => {
      await setSetting(key, value);
      await writeBackgroundConfig(db);
      if (key === 'autoDownload') await autoDownloadNew(db);
    };

  const runImport = async () => {
    setBusy('Importing…');
    try {
      const result = await importOpml(db, (p: ImportProgress) =>
        setBusy(`Importing ${p.done} of ${p.total}…`),
      );
      if (result) {
        const ok = result.total - result.failed.length;
        const failed = result.failed.slice(0, 6).map((f) => `• ${f}`);
        if (result.failed.length > 6) failed.push(`…and ${result.failed.length - 6} more`);
        Alert.alert(
          'Import finished',
          `Now following ${ok} podcast${ok === 1 ? '' : 's'}.` +
            (failed.length
              ? `\n\nCouldn’t load ${result.failed.length}:\n${failed.join('\n')}`
              : ''),
        );
      }
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const runRestore = async () => {
    setBusy('Restoring…');
    try {
      const result = await restoreFromFile(db, (p) =>
        setBusy(`${p.step}: ${p.done} of ${p.total}…`),
      );
      if (result) {
        Alert.alert(
          'Restore finished',
          `${result.podcasts} podcast${result.podcasts === 1 ? '' : 's'} restored.` +
            (result.failed.length
              ? `\n\nCouldn’t load: ${result.failed.slice(0, 6).join(', ')}`
              : ''),
        );
      }
    } catch (e) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const runRefresh = async () => {
    setBusy('Checking for new episodes…');
    try {
      const r = await refreshAll(db);
      if (r.failed)
        Alert.alert('Done', `${r.failed} podcast${r.failed === 1 ? '' : 's'} couldn’t be checked.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}>
      <ScreenHeader title="Settings" />

      <Section title="Appearance">
        <Row
          label="Theme"
          hint={s.theme === 'auto' ? 'Follows your phone’s light and dark mode' : undefined}
        />
        <Choices
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'paper', label: 'Paper' },
            { value: 'dusk', label: 'Dusk' },
            { value: 'midnight', label: 'Midnight' },
          ]}
          value={s.theme}
          onChange={set('theme')}
        />
        {s.theme === 'auto' && (
          <>
            <Row label="At night" hint="Midnight is true black, easiest on battery" />
            <Choices
              options={[
                { value: 'dusk', label: 'Dusk' },
                { value: 'midnight', label: 'Midnight' },
              ]}
              value={s.autoDark}
              onChange={set('autoDark')}
            />
          </>
        )}
        <Row
          label="Tint from cover art"
          hint="Colour the player and podcast pages to match the artwork (always on in Midnight)">
          <Switch
            value={s.tintFromArtwork}
            onValueChange={set('tintFromArtwork')}
            trackColor={{ true: theme.accent, false: theme.track }}
            thumbColor={theme.dark ? '#ddd' : '#fff'}
          />
        </Row>
        <Row label="Podcasts tab" />
        <Choices
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'large', label: 'Large grid' },
            { value: 'list', label: 'List' },
          ]}
          value={s.libraryLayout}
          onChange={set('libraryLayout')}
        />
        <Row label="Sort podcasts by" />
        <Choices
          options={[
            { value: 'latest', label: 'Latest episode' },
            { value: 'title', label: 'Name' },
            { value: 'added', label: 'Date added' },
          ]}
          value={s.librarySort}
          onChange={set('librarySort')}
        />
      </Section>

      <Section title="Playback">
        <Row label="Skip back" />
        <Choices
          options={[5, 10, 15, 30].map((v) => ({ value: v, label: `${v} s` }))}
          value={s.skipBackS}
          onChange={setPlayback('skipBackS')}
        />
        <Row label="Skip forward" />
        <Choices
          options={[10, 15, 30, 45, 60].map((v) => ({ value: v, label: `${v} s` }))}
          value={s.skipForwardS}
          onChange={setPlayback('skipForwardS')}
        />
        <Row label="Play Up Next automatically" hint="When an episode ends, start the next one">
          <Switch
            value={s.autoPlayNext}
            onValueChange={set('autoPlayNext')}
            trackColor={{ true: theme.accent, false: theme.track }}
            thumbColor={theme.dark ? '#ddd' : '#fff'}
          />
        </Row>
        {engine.kind === 'native' && (
          <>
            <Row label="Headphone double-press" hint="One press always plays or pauses" />
            <Choices
              options={HEADSET_OPTIONS}
              value={s.headsetDouble}
              onChange={setPlayback('headsetDouble')}
            />
            <Row label="Headphone triple-press" />
            <Choices
              options={HEADSET_OPTIONS}
              value={s.headsetTriple}
              onChange={setPlayback('headsetTriple')}
            />
          </>
        )}
        <Row
          label="Skip ads"
          hint="Chapters titled like ads (sponsor, promo…) and ad reads found in transcripts">
          <Switch
            value={s.adSkip}
            onValueChange={set('adSkip')}
            trackColor={{ true: theme.accent, false: theme.track }}
            thumbColor={theme.dark ? '#ddd' : '#fff'}
          />
        </Row>
        {s.adSkip && (
          <>
            <Row
              label="Ad detection"
              hint="How sure Caster must be before skipping an ad read from a transcript"
            />
            <Choices
              options={[
                { value: 'cautious', label: 'Cautious' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'eager', label: 'Eager' },
              ]}
              value={s.adSensitivity}
              onChange={set('adSensitivity')}
            />
          </>
        )}
        <Row label="Smart bookmarks" hint="With a transcript, bookmarks keep what was just said">
          <Switch
            value={s.smartBookmarks}
            onValueChange={set('smartBookmarks')}
            trackColor={{ true: theme.accent, false: theme.track }}
            thumbColor={theme.dark ? '#ddd' : '#fff'}
          />
        </Row>
        {engine.kind === 'basic' && (
          <Txt variant="small" secondary style={styles.note}>
            Running in Expo Go: trim silence, volume boost and background playback need the
            installed app.
          </Txt>
        )}
      </Section>

      {downloadsAvailable && (
        <Section title="Downloads and updates">
          <LinkRow
            icon="download-simple"
            label="Downloads"
            hint="See and remove downloaded episodes"
            onPress={() => router.push('/downloads')}
          />
          <Row
            label="Check for new episodes"
            hint="In the background, even when Caster is closed"
          />
          <Choices
            options={[
              { value: 0, label: 'Only when open' },
              { value: 1, label: 'Hourly' },
              { value: 4, label: 'Every 4 h' },
              { value: 12, label: 'Every 12 h' },
            ]}
            value={s.refreshHours}
            onChange={setBackground('refreshHours')}
          />
          <Row
            label="New-episode notifications"
            hint="One alert per podcast when something new comes out">
            <Switch
              value={s.notifyNewEpisodes}
              onValueChange={async (on) => {
                if (on && !(await requestNotificationPermission())) {
                  Alert.alert(
                    'Notifications are off',
                    'Allow notifications for Caster in Android’s settings to get new-episode alerts.',
                  );
                  return;
                }
                await setBackground('notifyNewEpisodes')(on);
              }}
              trackColor={{ true: theme.accent, false: theme.track }}
              thumbColor={theme.dark ? '#ddd' : '#fff'}
            />
          </Row>
          <Row label="Auto-download" hint="The newest new episodes of every podcast" />
          <Choices
            options={[
              { value: 0, label: 'Off' },
              { value: 1, label: 'Newest 1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 5, label: '5' },
            ]}
            value={s.autoDownload}
            onChange={setBackground('autoDownload')}
          />
          {s.autoDownload > 0 && (
            <>
              <Row label="Only on Wi-Fi">
                <Switch
                  value={s.downloadWifiOnly}
                  onValueChange={setBackground('downloadWifiOnly')}
                  trackColor={{ true: theme.accent, false: theme.track }}
                  thumbColor={theme.dark ? '#ddd' : '#fff'}
                />
              </Row>
              <Row label="Only while charging">
                <Switch
                  value={s.downloadChargingOnly}
                  onValueChange={setBackground('downloadChargingOnly')}
                  trackColor={{ true: theme.accent, false: theme.track }}
                  thumbColor={theme.dark ? '#ddd' : '#fff'}
                />
              </Row>
            </>
          )}
          <Row
            label="Storage limit"
            hint="Removes played downloads, oldest first, to stay under it"
          />
          <Choices
            options={[
              { value: 0, label: 'No limit' },
              { value: 1, label: '1 GB' },
              { value: 2, label: '2 GB' },
              { value: 5, label: '5 GB' },
              { value: 10, label: '10 GB' },
            ]}
            value={s.storageCapGb}
            onChange={async (v) => {
              await setSetting('storageCapGb', v);
              await enforceStorageCap(db);
            }}
          />
          <Row label="Delete after playing" hint="Remove a download once you finish the episode">
            <Switch
              value={s.deletePlayedDownloads}
              onValueChange={set('deletePlayedDownloads')}
              trackColor={{ true: theme.accent, false: theme.track }}
              thumbColor={theme.dark ? '#ddd' : '#fff'}
            />
          </Row>
        </Section>
      )}

      {speechAvailable && (
        <Section title="Generated transcripts">
          <Row
            label="Speech model"
            hint="Make transcripts on this phone for episodes that don’t come with one. Bigger models are more accurate and slower."
          />
          <SpeechModels />
        </Section>
      )}

      <Section title="Your podcasts">
        <LinkRow
          icon="arrows-clockwise"
          label="Check for new episodes"
          hint={
            s.lastRefreshAt
              ? `Last checked ${releaseDate(s.lastRefreshAt).toLowerCase()}, ${new Date(s.lastRefreshAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : undefined
          }
          onPress={runRefresh}
        />
        <LinkRow
          icon="export"
          label="Back up now"
          hint="Everything: podcasts, progress, playlists, bookmarks, settings"
          onPress={() => void shareBackup(db)}
        />
        <LinkRow
          icon="arrow-counter-clockwise"
          label="Restore from a backup"
          hint="Merges in a Caster backup; nothing here is lost"
          onPress={runRestore}
        />
        <LinkRow
          icon="chart-bar"
          label="Listening stats"
          hint="Time listened and time saved"
          onPress={() => router.push('/stats')}
        />
        <LinkRow
          icon="download-simple"
          label="Import subscriptions"
          hint="From an OPML file exported by another podcast app"
          onPress={runImport}
        />
        <LinkRow
          icon="upload-simple"
          label="Export subscriptions"
          hint="As an OPML file any podcast app can read"
          onPress={() => void shareOpml(db)}
        />
        {busy && (
          <Txt variant="small" color={theme.accent} style={styles.note}>
            {busy}
          </Txt>
        )}
      </Section>

      <Section title="About">
        <Row
          label={`Caster ${Constants.expoConfig?.version ?? ''}`}
          hint="Free and open source (GPL-3.0). No account, no ads, no tracking: your podcasts and listening history stay on this phone. The app talks only to podcast hosts and, for search, Apple’s public directory."
        />
        <LinkRow
          icon="info"
          label="Source code"
          hint="github.com/jjroth001/Caster"
          onPress={() => void Linking.openURL('https://github.com/jjroth001/Caster')}
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  sectionTitle: { marginLeft: Spacing.two, marginBottom: Spacing.two },
  card: { paddingVertical: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  rowText: { flex: 1, gap: 2 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  note: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
});
