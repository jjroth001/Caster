import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { useDownloadStatus } from '@/downloads/progress';
import {
  deleteModel,
  downloadModel,
  modelUri,
  SPEECH_MODELS,
  type SpeechModel,
} from '@/transcripts/whisper';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

function ModelRow({ model, selected }: { model: SpeechModel; selected: boolean }) {
  const theme = useTheme();
  const setSetting = useSetSetting();
  const status = useDownloadStatus(`model:${model.id}`);
  const ready = status?.state === 'done' || !!modelUri(model.id);
  const downloading = !ready && (status?.state === 'downloading' || status?.state === 'queued');
  const failed = !ready && status?.state === 'failed';
  const statusText = ready
    ? ' · downloaded'
    : status?.state === 'downloading'
      ? ` · downloading ${Math.round(status.progress * 100)}%`
      : status?.state === 'queued'
        ? ' · waiting to download…'
        : failed
          ? ` · download failed${status?.error ? ` (${status.error})` : ''}, tap to retry`
          : '';

  const onPress = () => {
    if (ready) {
      void setSetting('speechModel', model.id);
      return;
    }
    if (downloading) {
      Alert.alert(`Stop downloading ${model.label}?`, undefined, [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => deleteModel(model.id) },
      ]);
      return;
    }
    if (failed) {
      downloadModel(model);
      return;
    }
    Alert.alert(
      `Download ${model.label}?`,
      `${model.sizeMb} MB from the whisper.cpp project on Hugging Face. Transcripts are then made entirely on this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            downloadModel(model);
            void setSetting('speechModel', model.id);
          },
        },
      ],
    );
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={styles.row}>
      <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.textSecondary }]}>
        {selected && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
      </View>
      <View style={styles.text}>
        <Txt variant="bodyBold">{model.label}</Txt>
        <Txt variant="small" secondary>
          {model.hint} · {model.sizeMb} MB
          {statusText}
        </Txt>
      </View>
      {ready ? (
        <Pressable
          onPress={() =>
            Alert.alert(`Delete ${model.label}?`, 'Transcripts already made are kept.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteModel(model.id) },
            ])
          }
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${model.label} model`}>
          <Icon name="trash" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : (
        !downloading && (
          <Icon
            name={failed ? 'warning' : 'download-simple'}
            size={20}
            color={failed ? theme.danger : theme.accent}
          />
        )
      )}
    </Pressable>
  );
}

/** Settings: choose and download the speech model for generated transcripts. */
export function SpeechModels() {
  const s = useSettings().data ?? DEFAULT_SETTINGS;
  return (
    <View>
      {SPEECH_MODELS.map((m) => (
        <ModelRow key={m.id} model={m} selected={s.speechModel === m.id} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, gap: 2 },
});
