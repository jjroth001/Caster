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
    </SettingsPage>
  );
}
