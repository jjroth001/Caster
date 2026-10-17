import { useState } from 'react';
import { Alert } from 'react-native';

import { PickerRow, RowDivider } from '@/components/picker-row';
import {
  LinkRow,
  Row,
  Section,
  SettingsPage,
  settingsStyles,
  Toggle,
  useSettingsEditor,
} from '@/components/settings-ui';
import { Txt } from '@/components/text';
import { requestNotificationPermission } from '@/downloads/background';
import { downloadsAvailable } from '@/downloads/downloads';
import { refreshAll } from '@/feeds/sync';
import { releaseDate } from '@/lib/format';
import { useTheme } from '@/theme/theme-provider';

export default function NewEpisodeSettings() {
  const theme = useTheme();
  const { db, s, setBackground } = useSettingsEditor();
  const [busy, setBusy] = useState(false);

  const checkNow = async () => {
    setBusy(true);
    try {
      const r = await refreshAll(db);
      if (r.failed)
        Alert.alert('Done', `${r.failed} podcast${r.failed === 1 ? '' : 's'} couldn’t be checked.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title="New episodes">
      <Section>
        <LinkRow
          icon="arrows-clockwise"
          label="Check now"
          hint={
            s.lastRefreshAt
              ? `Last checked ${releaseDate(s.lastRefreshAt).toLowerCase()}, ${new Date(s.lastRefreshAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : undefined
          }
          onPress={() => void checkNow()}
        />
        {busy && (
          <Txt variant="small" color={theme.accent} style={settingsStyles.note}>
            Checking for new episodes…
          </Txt>
        )}
      </Section>

      {downloadsAvailable && (
        <Section title="In the background">
          <PickerRow
            label="Check for new episodes"
            hint="Even when Caster is closed"
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
            label="Notifications"
            hint="One alert per podcast when something new comes out (each podcast can turn its own off)">
            <Toggle
              value={s.notifyNewEpisodes}
              onChange={async (on) => {
                if (on && !(await requestNotificationPermission())) {
                  Alert.alert(
                    'Notifications are off',
                    'Allow notifications for Caster in Android’s settings to get new-episode alerts.',
                  );
                  return;
                }
                await setBackground('notifyNewEpisodes')(on);
              }}
            />
          </Row>
        </Section>
      )}
    </SettingsPage>
  );
}
