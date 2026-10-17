import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/theme-provider';

/** The page behind every screen: a flat colour, or Dusk's night gradient. */
export function Background({ tint }: { tint?: string | null }) {
  const theme = useTheme();
  const stops = tint ? [tint, theme.background, theme.background] : theme.gradient;
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}
      pointerEvents="none">
      {stops && (
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bg" x1="0" y1="0" x2={tint ? '0' : '0.4'} y2="1">
              <Stop offset="0" stopColor={stops[0]} />
              <Stop offset={tint ? '0.45' : '0.55'} stopColor={stops[1]} />
              <Stop offset="1" stopColor={stops[2]} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bg)" />
        </Svg>
      )}
    </View>
  );
}
