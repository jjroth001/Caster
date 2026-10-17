import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { showSheet } from '@/components/sheet';
import { Txt } from '@/components/text';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

export type PickerOption<T> = { value: T; label: string; hint?: string; disabled?: boolean };

/**
 * A setting on one line with its current value on the right; tapping it slides up a sheet of
 * choices. Replaces rows of pill buttons everywhere in the app.
 */
export function PickerRow<T>({
  label,
  hint,
  options,
  value,
  onChange,
  sheetTitle,
  sheetMessage,
  valueLabel,
}: {
  label: string;
  hint?: string;
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  sheetTitle?: string;
  sheetMessage?: string;
  /** What to show on the right when it differs from the option's own label. */
  valueLabel?: string;
}) {
  const theme = useTheme();
  const current = options.find((o) => o.value === value);
  const shown = valueLabel ?? current?.label ?? '—';
  const open = () =>
    showSheet({
      title: sheetTitle ?? label,
      message: sheetMessage ?? hint,
      choice: true,
      options: options
        .filter((o) => !o.disabled)
        .map((o) => ({
          label: o.label,
          hint: o.hint,
          selected: o.value === value,
          onPress: () => onChange(o.value),
        })),
    });
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}`}
      accessibilityHint="Opens the choices"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
      <View style={styles.text}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary numberOfLines={2}>
            {hint}
          </Txt>
        )}
      </View>
      <Txt variant="smallBold" color={theme.accent} style={styles.value} numberOfLines={1}>
        {shown}
      </Txt>
      <Icon name="caret-right" size={16} color={theme.textSecondary} duotone={false} />
    </Pressable>
  );
}

/** A row laid out like a PickerRow that opens another screen (or runs an action) instead. */
export function NavRow({
  label,
  hint,
  value,
  onPress,
  chevron = true,
}: {
  label: string;
  hint?: string;
  value?: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
      <View style={styles.text}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary>
            {hint}
          </Txt>
        )}
      </View>
      {!!value && (
        <Txt variant="smallBold" color={theme.accent} style={styles.value} numberOfLines={1}>
          {value}
        </Txt>
      )}
      {chevron && <Icon name="caret-right" size={16} color={theme.textSecondary} duotone={false} />}
    </Pressable>
  );
}

/** A thin line between rows in a card. */
export function RowDivider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />;
}

/** Any other row content laid out like a PickerRow (label left, control right). */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary>
            {hint}
          </Txt>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    minHeight: 56,
  },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: '45%', textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three },
});
