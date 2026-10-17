import { PickerRow, RowDivider } from '@/components/picker-row';
import { Row, Section, SettingsPage, Toggle, useSettingsEditor } from '@/components/settings-ui';
import { LIBRARY_SORTS } from '@/db/settings';

export default function AppearanceSettings() {
  const { s, set } = useSettingsEditor();
  return (
    <SettingsPage title="Appearance">
      <Section title="Theme">
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
          <Toggle value={s.tintFromArtwork} onChange={set('tintFromArtwork')} />
        </Row>
      </Section>

      <Section title="Podcasts tab">
        <PickerRow
          label="Layout"
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
          label="Sort by"
          options={LIBRARY_SORTS}
          value={s.librarySort}
          onChange={set('librarySort')}
        />
      </Section>
    </SettingsPage>
  );
}
