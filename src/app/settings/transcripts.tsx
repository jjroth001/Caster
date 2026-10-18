import { router } from 'expo-router';

import { PickerRow, RowDivider } from '@/components/picker-row';
import { LinkRow, Row, Section, SettingsPage, useSettingsEditor } from '@/components/settings-ui';
import { SpeechModels } from '@/components/speech-models';
import { runAutoTranscribe, syncBackgroundTranscribe } from '@/transcripts/auto';
import { speechAvailable } from '@/transcripts/whisper';

export default function TranscriptSettings() {
  const { db, s, setSetting } = useSettingsEditor();
  return (
    <SettingsPage title="Transcripts & bookmarks">
      <Section>
        <LinkRow
          icon="file-text"
          label="Transcripts"
          hint="See and export every transcript"
          chevron
          onPress={() => router.push('/transcripts')}
        />
        <RowDivider />
        <LinkRow
          icon="bookmarks-simple"
          label="Bookmarks"
          hint="Every bookmark, from every episode"
          chevron
          onPress={() => router.push('/bookmarks')}
        />
      </Section>

      {speechAvailable && (
        <Section title="Made on this phone">
          <Row
            label="Speech model"
            hint="Make transcripts for episodes that don’t come with one. Bigger models are more accurate and slower."
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
                label: 'While Pod Wizard is open',
                hint: 'Or playing in the background',
              },
              {
                value: 'always' as const,
                label: 'Any time',
                hint: 'Android wakes Pod Wizard while charging, even when it’s closed (shows a notification while it works)',
              },
            ]}
            value={s.autoTranscribe}
            onChange={async (v) => {
              await setSetting('autoTranscribe', v);
              await syncBackgroundTranscribe(db);
              void runAutoTranscribe(db);
            }}
          />
        </Section>
      )}
    </SettingsPage>
  );
}
