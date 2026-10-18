import Constants from 'expo-constants';
import { Linking } from 'react-native';

import { RowDivider } from '@/components/picker-row';
import { LinkRow, Row, Section, SettingsPage } from '@/components/settings-ui';

export default function AboutSettings() {
  return (
    <SettingsPage title="About Pod Wizard">
      <Section>
        <Row
          label={`Pod Wizard ${Constants.expoConfig?.version ?? ''}`}
          hint="Free and open source (GPL-3.0). No account, no ads, no tracking: your podcasts and listening history stay on this phone. The app talks only to podcast hosts and, for search, Apple’s public directory."
        />
        <RowDivider />
        <LinkRow
          icon="info"
          label="Source code"
          hint="github.com/jjroth001/PodWizard"
          onPress={() => void Linking.openURL('https://github.com/jjroth001/PodWizard')}
        />
      </Section>
    </SettingsPage>
  );
}
