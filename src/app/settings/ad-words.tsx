import { useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { RowDivider } from '@/components/picker-row';
import {
  Row,
  Section,
  SettingsPage,
  settingsStyles,
  useSettingsEditor,
} from '@/components/settings-ui';
import { Txt } from '@/components/text';
import { refreshSkipRules } from '@/player/controller';
import { setChapterWords } from '@/player/chapters';
import { setAdPhrases } from '@/transcripts/transcripts';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const KINDS = {
  phrases: {
    title: 'Ad phrases',
    placeholder: 'A sponsor’s name, or “our friends at”',
    note: 'A transcript sentence with one of these counts as part of an ad read. A one-word phrase is treated like a sponsor’s name and followed through the read. Transcripts on your phone are checked again when you change the list.',
    empty:
      'None yet. Caster already knows the usual ones (“brought to you by”, “use code”, web addresses).',
  },
  chapters: {
    title: 'Chapter words',
    placeholder: 'A word in ad chapters’ titles',
    note: 'Chapters whose title has one of these words are skipped. Adding a word skips matching chapters already saved too.',
    empty: 'None. Chapters won’t be skipped by their title.',
  },
} as const;

/** Edits one of the word lists ad skipping uses: transcript phrases, or chapter title words. */
export default function AdWordsSettings() {
  const theme = useTheme();
  const { kind: param } = useLocalSearchParams<{ kind?: string }>();
  const kind = param === 'chapters' ? 'chapters' : 'phrases';
  const text = KINDS[kind];
  const { db, s } = useSettingsEditor();
  const words = kind === 'chapters' ? s.adKeywords : s.adPhrases;
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      if (kind === 'chapters') await setChapterWords(db, next);
      else await setAdPhrases(db, next);
      await refreshSkipRules(db);
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const word = draft.trim();
    setDraft('');
    if (!word || words.some((w) => w.toLowerCase() === word.toLowerCase())) return;
    void save([...words, word]);
  };

  return (
    <SettingsPage title={text.title}>
      <View style={styles.addRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={text.placeholder}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, backgroundColor: theme.element }]}
        />
        <Button label="Add" onPress={add} disabled={!draft.trim()} />
      </View>

      <Section>
        {words.length === 0 ? (
          <Txt variant="small" secondary style={styles.empty}>
            {text.empty}
          </Txt>
        ) : (
          words.map((w, i) => (
            <Fragment key={w}>
              {i > 0 && <RowDivider />}
              <Row label={w}>
                <Pressable
                  onPress={() => void save(words.filter((x) => x !== w))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${w}`}
                  hitSlop={10}>
                  <Icon name="x" size={18} color={theme.textSecondary} duotone={false} />
                </Pressable>
              </Row>
            </Fragment>
          ))
        )}
      </Section>

      <Txt variant="small" secondary style={settingsStyles.note}>
        {saving ? 'Checking your transcripts again…' : text.note}
      </Txt>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  empty: { padding: Spacing.three },
  input: {
    flex: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
});
