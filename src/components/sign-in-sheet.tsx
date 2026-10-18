import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { closeSheet, showCustomSheet } from '@/components/sheet';
import { Txt } from '@/components/text';
import type { FeedLogin } from '@/feeds/credentials';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Labels = { user: string; password: string; note: string; confirm: string };

const FEED_LABELS: Labels = {
  user: 'Username or email',
  password: 'Password',
  note: 'Kept encrypted on this phone and sent only to this podcast’s servers. Not included in backups.',
  confirm: 'Sign in',
};

function SignInForm({
  onSubmit,
  labels,
}: {
  onSubmit: (login: FeedLogin) => void;
  labels: Labels;
}) {
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const ready = username.trim().length > 0 && password.length > 0;
  const submit = () => {
    if (!ready) return;
    closeSheet();
    onSubmit({ username: username.trim(), password });
  };
  const input = [styles.input, { color: theme.text, backgroundColor: theme.element }];
  return (
    <View style={styles.body}>
      <TextInput
        value={username}
        onChangeText={setUsername}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        placeholder={labels.user}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="next"
        style={input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        placeholder={labels.password}
        placeholderTextColor={theme.textSecondary}
        onSubmitEditing={submit}
        returnKeyType="done"
        style={input}
      />
      <Txt variant="small" secondary>
        {labels.note}
      </Txt>
      <View style={styles.buttons}>
        <Pressable onPress={closeSheet} accessibilityRole="button" style={styles.textButton}>
          <Txt variant="bodyBold" secondary>
            Cancel
          </Txt>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!ready}
          accessibilityRole="button"
          style={[styles.confirm, { backgroundColor: theme.accent, opacity: ready ? 1 : 0.5 }]}>
          <Txt variant="bodyBold" color={theme.onAccent}>
            {labels.confirm}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** Asks for a private feed's username and password. */
export function showSignIn(title: string, onSubmit: (login: FeedLogin) => void) {
  showCustomSheet({
    title,
    message: 'This podcast feed is private. Sign in with the details its publisher gave you.',
    content: <SignInForm onSubmit={onSubmit} labels={FEED_LABELS} />,
  });
}

/** Asks for a pair of secrets for another service (such as an API key and secret). */
export function showKeyForm(
  title: string,
  message: string,
  labels: Labels,
  onSubmit: (pair: { first: string; second: string }) => void,
) {
  showCustomSheet({
    title,
    message,
    content: (
      <SignInForm
        labels={labels}
        onSubmit={(l) => onSubmit({ first: l.username, second: l.password })}
      />
    ),
  });
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.four, gap: Spacing.three },
  input: {
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  textButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  confirm: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.pill,
  },
});
