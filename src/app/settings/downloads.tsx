import { router } from 'expo-router';

import { NavRow, PickerRow, RowDivider } from '@/components/picker-row';
import {
  LinkRow,
  Row,
  Section,
  SettingsPage,
  Toggle,
  useSettingsEditor,
} from '@/components/settings-ui';
import { ARCHIVE_INACTIVE_OPTIONS, ARCHIVE_PLAYED_OPTIONS, runAutoArchive } from '@/db/archive';
import { enforceStorageCap } from '@/downloads/downloads';

export default function DownloadSettings() {
  const { db, s, setSetting, set } = useSettingsEditor();
  return (
    <SettingsPage title="Downloads & storage">
      <Section>
        <LinkRow
          icon="download-simple"
          label="Downloads"
          hint="See and remove downloaded episodes"
          chevron
          onPress={() => router.push('/downloads')}
        />
      </Section>

      <Section title="Automatic">
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
      </Section>

      <Section title="Storage">
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
          <Toggle value={s.deletePlayedDownloads} onChange={set('deletePlayedDownloads')} />
        </Row>
      </Section>

      <Section title="Auto-archive">
        <PickerRow
          label="Played episodes"
          hint="Archived episodes leave the podcast’s list; playing one brings it back"
          options={ARCHIVE_PLAYED_OPTIONS}
          value={s.autoArchivePlayed}
          onChange={async (v) => {
            await setSetting('autoArchivePlayed', v);
            await runAutoArchive(db);
          }}
        />
        <RowDivider />
        <PickerRow
          label="Episodes you haven’t started"
          hint="Once they’re this old"
          options={ARCHIVE_INACTIVE_OPTIONS}
          value={s.autoArchiveInactive}
          onChange={async (v) => {
            await setSetting('autoArchiveInactive', v);
            await runAutoArchive(db);
          }}
        />
        <RowDivider />
        <Row
          label="Include starred episodes"
          hint="Up Next, playing and downloaded episodes are never archived">
          <Toggle value={s.autoArchiveStarred} onChange={set('autoArchiveStarred')} />
        </Row>
      </Section>
    </SettingsPage>
  );
}
