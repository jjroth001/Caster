import { useState } from 'react';
import { Alert } from 'react-native';

import { NavRow, PickerRow, RowDivider } from '@/components/picker-row';
import {
  LinkRow,
  Section,
  SettingsPage,
  settingsStyles,
  useSettingsEditor,
} from '@/components/settings-ui';
import { Txt } from '@/components/text';
import {
  BACKUPS_KEPT,
  chooseBackupFolder,
  runAutoBackupIfDue,
  writeAutoBackup,
} from '@/lib/auto-backup';
import {
  importOpml,
  restoreFromFile,
  shareBackup,
  shareOpml,
  type ImportProgress,
} from '@/lib/data-transfer';
import { releaseDate } from '@/lib/format';
import { useTheme } from '@/theme/theme-provider';

export default function BackupSettings() {
  const theme = useTheme();
  const { db, s, setSetting } = useSettingsEditor();
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <SettingsPage title="Backup & import">
      <Section title="Backups">
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
          hint="Merges in a Pod Wizard backup; nothing here is lost"
          onPress={() => void runRestore()}
        />
      </Section>

      <Section title="Other podcast apps">
        <LinkRow
          icon="download-simple"
          label="Import subscriptions"
          hint="From an OPML file exported by another podcast app"
          onPress={() => void runImport()}
        />
        <RowDivider />
        <LinkRow
          icon="upload-simple"
          label="Export subscriptions"
          hint="As an OPML file any podcast app can read"
          onPress={() => void shareOpml(db)}
        />
      </Section>

      {busy && (
        <Txt variant="small" color={theme.accent} style={settingsStyles.note}>
          {busy}
        </Txt>
      )}
    </SettingsPage>
  );
}
