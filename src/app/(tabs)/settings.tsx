import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/controls';
import { Icon, type IconName } from '@/components/icons/icon';
import { RowDivider } from '@/components/picker-row';
import { ScreenHeader } from '@/components/screen-header';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { downloadsAvailable } from '@/downloads/downloads';
import { askToRunInBackground, useBackgroundAllowed } from '@/lib/battery';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

type Category = { icon: IconName; label: string; hint?: string; href: Href; show?: boolean };

const CATEGORIES: Category[] = [
  {
    icon: 'palette',
    label: 'Appearance',
    hint: 'Theme, cover colours, library layout',
    href: '/settings/appearance',
  },
  {
    icon: 'headphones',
    label: 'Playback',
    hint: 'Skip times, Up Next, headphone buttons',
    href: '/settings/playback',
  },
  {
    icon: 'scissors',
    label: 'Ad skipping',
    hint: 'On or off, how sure before skipping',
    href: '/settings/ads',
  },
  {
    icon: 'bell',
    label: 'New episodes',
    hint: 'Background checks, notifications',
    href: '/settings/new-episodes',
  },
  {
    icon: 'download-simple',
    label: 'Downloads & storage',
    hint: 'Auto-download, storage limit',
    href: '/settings/downloads',
    show: downloadsAvailable,
  },
  {
    icon: 'file-text',
    label: 'Transcripts & bookmarks',
    hint: 'Speech model, automatic transcripts',
    href: '/settings/transcripts',
  },
  {
    icon: 'archive',
    label: 'Backup & import',
    hint: 'Backups, restore, OPML',
    href: '/settings/backup',
  },
];

const MORE: Category[] = [
  { icon: 'chart-bar', label: 'Listening stats', href: '/stats' },
  { icon: 'info', label: 'About Caster', href: '/settings/about' },
];

function CategoryRow({ item }: { item: Category }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(item.href)}
      accessibilityRole="button"
      accessibilityHint={item.hint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.element }]}>
      <Icon name={item.icon} size={26} color={theme.accent} />
      <View style={styles.rowText}>
        <Txt variant="bodyBold">{item.label}</Txt>
        {!!item.hint && (
          <Txt variant="small" secondary numberOfLines={1}>
            {item.hint}
          </Txt>
        )}
      </View>
      <Icon name="caret-right" size={16} color={theme.textSecondary} duotone={false} />
    </Pressable>
  );
}

function Group({ items }: { items: Category[] }) {
  const shown = items.filter((i) => i.show !== false);
  return (
    <Card style={styles.card}>
      {shown.map((item, i) => (
        <Fragment key={item.label}>
          {i > 0 && <RowDivider />}
          <CategoryRow item={item} />
        </Fragment>
      ))}
    </Card>
  );
}

/** A short page of categories, each opening its own screen of settings. */
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const backgroundAllowed = useBackgroundAllowed();

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottom }}>
      <ScreenHeader title="Settings" />

      {downloadsAvailable && !backgroundAllowed && (
        <View
          style={[styles.banner, { backgroundColor: theme.element, borderColor: theme.accent }]}>
          <Icon name="warning" size={26} color={theme.accent} />
          <View style={styles.rowText}>
            <Txt variant="bodyBold">Let Caster work in the background</Txt>
            <Txt variant="small" secondary>
              Android’s battery saving may stop new-episode checks, downloads and transcripts while
              Caster is closed.
            </Txt>
          </View>
          <Button label="Allow" onPress={askToRunInBackground} />
        </View>
      )}

      <View style={styles.group}>
        <Group items={CATEGORIES} />
      </View>
      <View style={styles.group}>
        <Group items={MORE} />
      </View>

      <Txt variant="small" secondary style={styles.footer}>
        Caster {Constants.expoConfig?.version ?? ''} · open source, no account, no ads
      </Txt>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
  card: { paddingVertical: Spacing.one, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    minHeight: 60,
  },
  rowText: { flex: 1, gap: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.four,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: { textAlign: 'center', marginTop: -Spacing.two },
});
