import { useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { DEFAULT_SETTINGS, type Settings } from '@/db/settings';
import { useSetSetting, useSettings } from '@/db/use-settings';
import { writeBackgroundConfig } from '@/downloads/background';
import { applyPlayerSettings } from '@/player/controller';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

/** The building blocks every settings screen shares. */

/** A headed card of rows. */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {!!title && (
        <Txt variant="meta" secondary style={styles.sectionTitle}>
          {title}
        </Txt>
      )}
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

/** A label (and hint) on the left, any control on the right. */
export function Row({
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
      <View style={styles.rowText}>
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

/** A row with an icon that does something or opens something. */
export function LinkRow({
  icon,
  label,
  hint,
  onPress,
  chevron = false,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
      <Icon name={icon} size={24} color={theme.accent} />
      <View style={styles.rowText}>
        <Txt variant="bodyBold">{label}</Txt>
        {!!hint && (
          <Txt variant="small" secondary>
            {hint}
          </Txt>
        )}
      </View>
      {chevron && <Icon name="caret-right" size={16} color={theme.textSecondary} duotone={false} />}
    </Pressable>
  );
}

/** An on/off switch in the theme's colours. */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: theme.accent, false: theme.track }}
      thumbColor={theme.dark ? '#ddd' : '#fff'}
    />
  );
}

/** A settings category's own screen: back button, title and a scrolling list of sections. */
export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const bottom = useTabBarSpace();
  return (
    <SubScreen title={title}>
      <ScrollView contentContainerStyle={{ paddingTop: Spacing.two, paddingBottom: bottom }}>
        {children}
      </ScrollView>
    </SubScreen>
  );
}

/**
 * The current settings and ways to change them: `set` saves; `setPlayback` also updates the
 * player; `setBackground` also hands the background check a fresh snapshot.
 */
export function useSettingsEditor() {
  const db = useSQLiteContext();
  const s = useSettings().data ?? DEFAULT_SETTINGS;
  const setSetting = useSetSetting();
  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      void setSetting(key, value);
  const setPlayback =
    <K extends keyof Settings>(key: K) =>
    async (value: Settings[K]) => {
      await setSetting(key, value);
      await applyPlayerSettings(db);
    };
  const setBackground =
    <K extends keyof Settings>(key: K) =>
    async (value: Settings[K]) => {
      await setSetting(key, value);
      await writeBackgroundConfig(db);
    };
  return { db, s, setSetting, set, setPlayback, setBackground };
}

export const settingsStyles = StyleSheet.create({
  note: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
});

const styles = StyleSheet.create({
  section: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  sectionTitle: { marginLeft: Spacing.two, marginBottom: Spacing.two },
  card: { paddingVertical: Spacing.one, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowText: { flex: 1, gap: 2 },
});
