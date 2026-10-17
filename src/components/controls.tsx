import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const pressed = ({ pressed: p }: { pressed: boolean }) => (p ? { opacity: 0.6 } : null);

export function Chip({
  label,
  selected,
  onPress,
  icon,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const fg = selected ? theme.onAccent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={(s) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.element },
        disabled && { opacity: 0.35 },
        pressed(s),
      ]}>
      {icon && <Icon name={icon} size={16} color={fg} />}
      <Txt variant="smallBold" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  icon,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = kind === 'primary' ? theme.accent : theme.element;
  const fg = kind === 'primary' ? theme.onAccent : kind === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={(s) => [
        styles.button,
        { backgroundColor: bg },
        disabled && { opacity: 0.4 },
        pressed(s),
        style,
      ]}>
      {icon && <Icon name={icon} size={20} color={fg} />}
      <Txt variant="bodyBold" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A round icon button, with an optional soft circle behind it. */
export function IconButton({
  icon,
  onPress,
  label,
  size = 24,
  color,
  filled,
  children,
  hitSlop = 8,
}: {
  icon?: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  filled?: boolean;
  children?: ReactNode;
  hitSlop?: number;
}) {
  const theme = useTheme();
  const box = size + 20;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlop}
      style={(s) => [
        styles.iconButton,
        { width: box, height: box, borderRadius: box / 2 },
        filled && { backgroundColor: theme.element },
        pressed(s),
      ]}>
      {children ?? (icon && <Icon name={icon} size={size} color={color ?? theme.text} />)}
    </Pressable>
  );
}

/** Play/pause with an optional progress ring around it (episode rows). */
export function PlayButton({
  playing,
  progress,
  onPress,
  size = 40,
  label,
}: {
  playing: boolean;
  progress: number;
  onPress: () => void;
  size?: number;
  label: string;
}) {
  const theme = useTheme();
  const stroke = 2.4;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={(s) => [{ width: size, height: size }, styles.center, pressed(s)]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.track}
          strokeWidth={stroke}
          fill="none"
        />
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={theme.accent}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * Math.min(1, progress)} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <View style={!playing && { marginLeft: 2 }}>
        <Icon name={playing ? 'pause-fill' : 'play-fill'} size={size * 0.42} color={theme.text} />
      </View>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: 12,
  },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Radius.large, borderWidth: StyleSheet.hairlineWidth },
});
