import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';

/**
 * A strip in the page colour behind the clock and battery icons, so lists scrolling up don't
 * run underneath them. Matches the top of Dusk's gradient.
 */
export function StatusBarScrim() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.scrim,
        { height: insets.top, backgroundColor: theme.gradient?.[0] ?? theme.background },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
