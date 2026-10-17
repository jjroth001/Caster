import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';

/** A circular arrow with the number of seconds inside (skip back / forward). */
export function SkipButton({
  seconds,
  forward,
  onPress,
  size = 48,
}: {
  seconds: number;
  forward?: boolean;
  onPress: () => void;
  size?: number;
}) {
  const theme = useTheme();
  // A clockwise arc around (14, 15), open at the top right, ending in an arrowhead that points
  // right along the top. Mirrored for skip back.
  const arc = 'M18.5 7.21 A9 9 0 1 1 12.44 6.14 L14.9 5.7';
  const head = 'M11.53 3.86 L14.9 5.7 L12.37 8.58';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${forward ? 'Skip forward' : 'Skip back'} ${seconds} seconds`}
      hitSlop={10}
      style={({ pressed }) => [
        { width: size, height: size },
        styles.center,
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[StyleSheet.absoluteFill, !forward && styles.mirror]}>
        <Svg width={size} height={size} viewBox="0 0 28 28">
          <Path d={arc} stroke={theme.text} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path
            d={head}
            stroke={theme.text}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <Txt variant="smallBold" style={[styles.number, { fontSize: size * 0.3 }]}>
        {seconds}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  number: { marginTop: 4, fontVariant: ['tabular-nums'] },
});
