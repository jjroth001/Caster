import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import { dismissSkipNotice, undoSkip, useSkipNotice } from '@/player/controller';
import { Motion } from '@/theme/motion';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const SHOW_MS = 6000;

/** "Skipped ad · Undo", shown for a few seconds whenever playback jumps over something. */
export function SkipToast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notice = useSkipNotice();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissSkipNotice, SHOW_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 150 }]}>
      <Reanimated.View
        key={notice.id}
        entering={Motion.rise}
        exiting={Motion.sink}
        style={[styles.toast, { backgroundColor: theme.miniPlayer }]}
        accessibilityLiveRegion="polite">
        <Icon name="sparkle" size={18} color={theme.accent} />
        <Txt
          variant="smallBold"
          color={theme.miniPlayerText}
          style={styles.label}
          numberOfLines={1}>
          {notice.label}
        </Txt>
        {notice.undo && (
          <Pressable onPress={() => undoSkip(notice)} accessibilityRole="button" hitSlop={10}>
            <Txt variant="smallBold" color={theme.accent}>
              Undo
            </Txt>
          </Pressable>
        )}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '90%',
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  label: { flexShrink: 1 },
});
