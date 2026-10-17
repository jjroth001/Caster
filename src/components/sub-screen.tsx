import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Background } from '@/components/background';
import { IconButton } from '@/components/controls';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { Txt } from '@/components/text';
import { Spacing } from '@/theme/themes';

/** A pushed screen with a back button, a title and optional buttons on the right. */
export function SubScreen({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      <Background />
      <View style={[styles.bar, { paddingTop: insets.top + Spacing.two }]}>
        <IconButton icon="caret-left" label="Back" onPress={() => router.back()} />
        <Txt variant="heading" style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Txt>
        {actions}
      </View>
      {children}
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: { flex: 1, marginLeft: Spacing.one },
});
