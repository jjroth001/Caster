import { router } from 'expo-router';

import { NavRow, PickerRow, RowDivider } from '@/components/picker-row';
import {
  Row,
  Section,
  SettingsPage,
  settingsStyles,
  Toggle,
  useSettingsEditor,
} from '@/components/settings-ui';
import { Txt } from '@/components/text';

export default function AdSettings() {
  const { s, set } = useSettingsEditor();
  return (
    <SettingsPage title="Ad skipping">
      <Section>
        <Row
          label="Skip ads"
          hint="Chapters titled like ads (sponsor, promo…) and ad reads found in transcripts">
          <Toggle value={s.adSkip} onChange={set('adSkip')} />
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
      </Section>
      {s.adSkip && (
        <Section title="What counts as an ad">
          <NavRow
            label="Ad phrases"
            hint="Words that mark an ad read in transcripts"
            value={String(s.adPhrases.length)}
            onPress={() => router.push('/settings/ad-words?kind=phrases')}
          />
          <RowDivider />
          <NavRow
            label="Chapter words"
            hint="Chapters titled with these are skipped"
            value={String(s.adKeywords.length)}
            onPress={() => router.push('/settings/ad-words?kind=chapters')}
          />
        </Section>
      )}
      <Txt variant="small" secondary style={settingsStyles.note}>
        Caster finds ads three ways: chapters titled like ads, ad reads in transcripts, and the same
        audio turning up in more than one downloaded episode. Every skip shows “Skipped ad · Undo”.
        Turn skipping off for a single show in its podcast settings, and set seconds to skip at its
        start and end there too.
      </Txt>
    </SettingsPage>
  );
}
