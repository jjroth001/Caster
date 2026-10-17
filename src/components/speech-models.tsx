import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { useDownloadProgress } from '@/downloads/progress';
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
  const progress = useDownloadProgress(`model:${model.id}`);
  const ready = !!modelUri(model.id);
  const downloading = progress != null;

  const onPress = () => {
    if (ready) {
      void setSetting('speechModel', model.id);
      return;
    }
    if (downloading) return;
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
          {downloading
            ? ` · downloading ${Math.round((progress ?? 0) * 100)}%`
            : ready
              ? ' · downloaded'
              : ''}
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
        !downloading && <Icon name="download-simple" size={20} color={theme.accent} />
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
