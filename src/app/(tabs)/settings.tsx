import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HeadsetAction } from '@modules/player-core/src';
import { Button, Card } from '@/components/controls';
import { NavRow, PickerRow, RowDivider } from '@/components/picker-row';
import { Icon, type IconName } from '@/components/icons/icon';
import { ScreenHeader } from '@/components/screen-header';
import { SpeechModels } from '@/components/speech-models';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS, LIBRARY_SORTS, type Settings } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { requestNotificationPermission, writeBackgroundConfig } from '@/downloads/background';
import { downloadsAvailable, enforceStorageCap } from '@/downloads/downloads';
import { refreshAll } from '@/feeds/sync';
import {
  importOpml,
  restoreFromFile,
  shareBackup,
  shareOpml,
  type ImportProgress,
} from '@/lib/data-transfer';
import {
  BACKUPS_KEPT,
  chooseBackupFolder,
  runAutoBackupIfDue,
  writeAutoBackup,
} from '@/lib/auto-backup';
import { askToRunInBackground, useBackgroundAllowed } from '@/lib/battery';
import { releaseDate } from '@/lib/format';
import { applyPlayerSettings } from '@/player/controller';
import { engine } from '@/player/engine';
import { runAutoTranscribe, syncBackgroundTranscribe } from '@/transcripts/auto';
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
  const backgroundAllowed = useBackgroundAllowed();

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

  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: theme.accent, false: theme.track }}
      thumbColor={theme.dark ? '#ddd' : '#fff'}
    />
  );
  const seconds = (values: number[]) => values.map((v) => ({ value: v, label: `${v} seconds` }));

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}>
      <ScreenHeader title="Settings" />

      <Section title="Appearance">
        <PickerRow
          label="Theme"
          hint={s.theme === 'auto' ? 'Follows your phone’s light and dark mode' : undefined}
          options={[
            {
              value: 'auto',
              label: 'Automatic',
              hint: 'Paper by day, your night theme in dark mode',
            },
            { value: 'paper', label: 'Paper', hint: 'Warm and light' },
            { value: 'dusk', label: 'Dusk', hint: 'Night blue with frosted glass' },
            { value: 'midnight', label: 'Midnight', hint: 'True black, easiest on battery' },
          ]}
          value={s.theme}
          onChange={set('theme')}
        />
        {s.theme === 'auto' && (
          <>
            <RowDivider />
            <PickerRow
              label="At night"
              options={[
                { value: 'dusk', label: 'Dusk' },
                { value: 'midnight', label: 'Midnight', hint: 'True black, easiest on battery' },
              ]}
              value={s.autoDark}
              onChange={set('autoDark')}
            />
          </>
        )}
        <RowDivider />
        <Row
          label="Tint from cover art"
          hint="Colour the player and podcast pages to match the artwork (always on in Midnight)">
          {toggle(s.tintFromArtwork, set('tintFromArtwork'))}
        </Row>
        <RowDivider />
        <PickerRow
          label="Podcasts tab"
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'large', label: 'Large grid' },
            { value: 'list', label: 'List', hint: 'With each show’s newest episode' },
          ]}
          value={s.libraryLayout}
          onChange={set('libraryLayout')}
        />
        <RowDivider />
        <PickerRow
          label="Sort podcasts by"
          options={LIBRARY_SORTS}
          value={s.librarySort}
          onChange={set('librarySort')}
        />
      </Section>

      <Section title="Playback">
        <PickerRow
          label="Skip back"
          options={seconds([5, 10, 15, 30])}
          value={s.skipBackS}
          onChange={setPlayback('skipBackS')}
        />
        <RowDivider />
        <PickerRow
          label="Skip forward"
          options={seconds([10, 15, 30, 45, 60])}
          value={s.skipForwardS}
          onChange={setPlayback('skipForwardS')}
        />
        <RowDivider />
        <Row label="Play Up Next automatically" hint="When an episode ends, start the next one">
          {toggle(s.autoPlayNext, set('autoPlayNext'))}
        </Row>
        {engine.kind === 'native' && (
          <>
            <RowDivider />
            <PickerRow
              label="Headphone double-press"
              hint="One press always plays or pauses"
              options={HEADSET_OPTIONS}
              value={s.headsetDouble}
              onChange={setPlayback('headsetDouble')}
            />
            <RowDivider />
            <PickerRow
              label="Headphone triple-press"
              options={HEADSET_OPTIONS}
              value={s.headsetTriple}
              onChange={setPlayback('headsetTriple')}
            />
          </>
        )}
        <RowDivider />
        <Row
          label="Skip ads"
          hint="Chapters titled like ads (sponsor, promo…) and ad reads found in transcripts">
          {toggle(s.adSkip, set('adSkip'))}
        </Row>
        {s.adSkip && (
          <>
            <RowDivider />
            <PickerRow
              label="Ad detection"
              hint="How sure Caster must be before skipping an ad read"
              options={[
                { value: 'cautious', label: 'Cautious', hint: 'Only clear-cut ad reads' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'eager', label: 'Eager', hint: 'Skips more, sometimes wrongly' },
              ]}
              value={s.adSensitivity}
              onChange={set('adSensitivity')}
            />
          </>
        )}
        <RowDivider />
        <Row label="Smart bookmarks" hint="With a transcript, bookmarks keep what was just said">
          {toggle(s.smartBookmarks, set('smartBookmarks'))}
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
          {!backgroundAllowed && (
            <>
              <Row
                label="Let Caster work in the background"
                hint="Android’s battery saving may stop new-episode checks, downloads and transcripts while Caster is closed.">
                <Button label="Allow" kind="secondary" onPress={askToRunInBackground} />
              </Row>
              <RowDivider />
            </>
          )}
          <LinkRow
            icon="download-simple"
            label="Downloads"
            hint="See and remove downloaded episodes"
            onPress={() => router.push('/downloads')}
          />
          <RowDivider />
          <PickerRow
            label="Check for new episodes"
            hint="In the background, even when Caster is closed"
            options={[
              { value: 0, label: 'Only when open' },
              { value: 1, label: 'Every hour' },
              { value: 4, label: 'Every 4 hours' },
              { value: 12, label: 'Every 12 hours' },
            ]}
            value={s.refreshHours}
            onChange={setBackground('refreshHours')}
          />
          <RowDivider />
          <Row
            label="New-episode notifications"
            hint="One alert per podcast when something new comes out">
            {toggle(s.notifyNewEpisodes, async (on) => {
              if (on && !(await requestNotificationPermission())) {
                Alert.alert(
                  'Notifications are off',
                  'Allow notifications for Caster in Android’s settings to get new-episode alerts.',
                );
                return;
              }
              await setBackground('notifyNewEpisodes')(on);
            })}
          </Row>
          <RowDivider />
          <NavRow
            label="Auto-download"
            hint="New episodes, Up Next and playlists, and when to download them"
            value={
              s.autoDownloadNew || s.autoDownloadUpNext || s.autoDownloadPlaylists.length > 0
                ? 'On'
                : 'Off'
            }
            onPress={() => router.push('/auto-download')}
          />
          <RowDivider />
          <PickerRow
            label="Storage limit"
            hint="Removes played downloads, oldest first, to stay under it"
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
          <RowDivider />
          <Row label="Delete after playing" hint="Remove a download once you finish the episode">
            {toggle(s.deletePlayedDownloads, set('deletePlayedDownloads'))}
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
          <RowDivider />
          <PickerRow
            label="Transcribe automatically"
            hint="Downloaded episodes without a transcript, while your phone is charging"
            options={[
              {
                value: 'off' as const,
                label: 'Off',
                hint: 'Only when you ask, from an episode’s transcript',
              },
              {
                value: 'open' as const,
                label: 'While Caster is open',
                hint: 'Or playing in the background',
              },
              {
                value: 'always' as const,
                label: 'Any time',
                hint: 'Android wakes Caster while charging, even when it’s closed (shows a notification while it works)',
              },
            ]}
            value={s.autoTranscribe}
            onChange={async (v) => {
              await setSetting('autoTranscribe', v);
              await syncBackgroundTranscribe(db);
              void runAutoTranscribe(db);
            }}
          />
          <RowDivider />
          <LinkRow
            icon="file-text"
            label="Transcripts"
            hint="See and export every transcript"
            onPress={() => router.push('/transcripts')}
          />
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
        <RowDivider />
        <LinkRow
          icon="export"
          label="Back up now"
          hint="Everything: podcasts, progress, playlists, bookmarks, settings"
          onPress={() => void shareBackup(db)}
        />
        <RowDivider />
        <PickerRow
          label="Automatic backup"
          hint={
            s.autoBackup === 'off'
              ? 'Into a folder you choose, such as one Nextcloud or Syncthing keeps in sync'
              : s.autoBackupError
                ? s.autoBackupError
                : s.lastAutoBackupAt
                  ? `Last backup ${releaseDate(s.lastAutoBackupAt).toLowerCase()} · keeps the newest ${BACKUPS_KEPT}`
                  : `Keeps the newest ${BACKUPS_KEPT}`
          }
          options={[
            { value: 'off' as const, label: 'Off' },
            { value: 'daily' as const, label: 'Daily' },
            { value: 'weekly' as const, label: 'Weekly' },
          ]}
          value={s.autoBackup}
          onChange={async (v) => {
            if (v !== 'off' && !s.autoBackupFolder && !(await chooseBackupFolder(db))) return;
            await setSetting('autoBackup', v);
            if (v !== 'off') await runAutoBackupIfDue(db);
          }}
        />
        {s.autoBackup !== 'off' && (
          <>
            <RowDivider />
            <NavRow
              label="Backup folder"
              value={s.autoBackupFolderName ?? 'Choose'}
              onPress={async () => {
                if (await chooseBackupFolder(db)) await writeAutoBackup(db);
              }}
            />
          </>
        )}
        <RowDivider />
        <LinkRow
          icon="arrow-counter-clockwise"
          label="Restore from a backup"
          hint="Merges in a Caster backup; nothing here is lost"
          onPress={runRestore}
        />
        <RowDivider />
        <LinkRow
          icon="chart-bar"
          label="Listening stats"
          hint="Time listened and time saved"
          onPress={() => router.push('/stats')}
        />
        <RowDivider />
        <LinkRow
          icon="download-simple"
          label="Import subscriptions"
          hint="From an OPML file exported by another podcast app"
          onPress={runImport}
        />
        <RowDivider />
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
        <RowDivider />
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
  card: { paddingVertical: Spacing.one, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowText: { flex: 1, gap: 2 },
  note: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
});
