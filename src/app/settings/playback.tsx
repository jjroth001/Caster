import type { HeadsetAction } from '@modules/player-core/src';
import { PickerRow, RowDivider } from '@/components/picker-row';
import {
  Row,
  Section,
  SettingsPage,
  settingsStyles,
  Toggle,
  useSettingsEditor,
} from '@/components/settings-ui';
import { Txt } from '@/components/text';
import { engine } from '@/player/engine';

const HEADSET_OPTIONS: { value: HeadsetAction; label: string }[] = [
  { value: 'skipForward', label: 'Skip forward' },
  { value: 'skipBack', label: 'Skip back' },
  { value: 'nextChapter', label: 'Next chapter' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'none', label: 'Nothing' },
];

const seconds = (values: number[]) => values.map((v) => ({ value: v, label: `${v} seconds` }));

export default function PlaybackSettings() {
  const { s, set, setPlayback } = useSettingsEditor();
  return (
    <SettingsPage title="Playback">
      <Section title="Skipping">
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
      </Section>

      <Section title="Up Next">
        <Row label="Play Up Next automatically" hint="When an episode ends, start the next one">
          <Toggle value={s.autoPlayNext} onChange={set('autoPlayNext')} />
        </Row>
      </Section>

      {engine.kind === 'native' && (
        <Section title="Headphone buttons">
          <PickerRow
            label="Double-press"
            hint="One press always plays or pauses"
            options={HEADSET_OPTIONS}
            value={s.headsetDouble}
            onChange={setPlayback('headsetDouble')}
          />
          <RowDivider />
          <PickerRow
            label="Triple-press"
            options={HEADSET_OPTIONS}
            value={s.headsetTriple}
            onChange={setPlayback('headsetTriple')}
          />
        </Section>
      )}

      {engine.kind === 'native' && (
        <Section title="Sleep timer">
          <Row
            label="Shake to add 5 minutes"
            hint="In the timer’s last minute, shake the phone to keep listening a little longer">
            <Toggle value={s.shakeToExtend} onChange={setPlayback('shakeToExtend')} />
          </Row>
        </Section>
      )}

      <Section title="Bookmarks">
        <Row label="Smart bookmarks" hint="With a transcript, bookmarks keep what was just said">
          <Toggle value={s.smartBookmarks} onChange={set('smartBookmarks')} />
        </Row>
      </Section>

      {engine.kind === 'basic' && (
        <Txt variant="small" secondary style={settingsStyles.note}>
          Running in Expo Go: trim silence, volume boost, headphone buttons and background playback
          need the installed app.
        </Txt>
      )}
    </SettingsPage>
  );
}
