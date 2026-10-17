import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/text';
import { Spacing } from '@/theme/themes';

/** A tab's large title with optional buttons on the right. */
export function ScreenHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Txt variant="title" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </Txt>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: { flex: 1, fontSize: 34, lineHeight: 42 },
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: -Spacing.two },
});
