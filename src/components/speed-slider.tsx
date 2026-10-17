import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Txt } from '@/components/text';
import { speedLabel } from '@/lib/format';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const MIN = 0.5;
const STEP = 0.1;
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Playback speed as a slider with a tick every 0.1× and labels every 0.5×. The big number
 * follows the finger; the speed changes when you let go (or on − / +).
 */
export function SpeedSlider({
  value,
  max = 3,
  onChange,
}: {
  value: number;
  max?: number;
  onChange: (speed: number) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(1);
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;
  const ticks = Math.round((max - MIN) / STEP) + 1;
  const fraction = (v: number) => (v - MIN) / (max - MIN);
  const toSpeed = (x: number) =>
    round(Math.min(max, Math.max(MIN, MIN + (x / width) * (max - MIN))));
  const nudge = (delta: number) => onChange(round(Math.min(max, Math.max(MIN, value + delta))));

  // minDistance 0: a tap on the track sets the speed too. Runs on the JS thread (it sets state).
  const pan = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => setDragging(toSpeed(e.x)))
    .onUpdate((e) => setDragging(toSpeed(e.x)))
    .onEnd((e) => onChange(toSpeed(e.x)))
    .onFinalize(() => setDragging(null));

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        <Pressable
          onPress={() => nudge(-STEP)}
          accessibilityRole="button"
          accessibilityLabel="Slower"
          hitSlop={8}
          style={[styles.step, { backgroundColor: theme.element }]}>
          <Txt variant="heading">−</Txt>
        </Pressable>
        <Txt variant="title" style={styles.value} accessibilityLiveRegion="polite">
          {speedLabel(shown)}
        </Txt>
        <Pressable
          onPress={() => nudge(STEP)}
          accessibilityRole="button"
          accessibilityLabel="Faster"
          hitSlop={8}
          style={[styles.step, { backgroundColor: theme.element }]}>
          <Txt variant="heading">+</Txt>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={styles.hit}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Playback speed"
          accessibilityValue={{ text: speedLabel(shown) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            nudge(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)
          }>
          <View pointerEvents="none" style={[styles.track, { backgroundColor: theme.track }]}>
            <View
              style={[
                styles.fill,
                { width: `${fraction(shown) * 100}%`, backgroundColor: theme.accent },
              ]}
            />
          </View>
          <View pointerEvents="none" style={styles.ticks}>
            {Array.from({ length: ticks }, (_, i) => {
              const v = round(MIN + i * STEP);
              const major = Math.abs(v * 2 - Math.round(v * 2)) < 0.001;
              return (
                <View
                  key={i}
                  style={[
                    styles.tick,
                    {
                      left: `${fraction(v) * 100}%`,
                      height: major ? 12 : 6,
                      backgroundColor: v <= shown + 0.001 ? theme.accent : theme.textSecondary,
                      opacity: major ? 0.9 : 0.5,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: fraction(shown) * width - (dragging != null ? 13 : 10),
                backgroundColor: theme.accent,
              },
              dragging != null && styles.thumbActive,
            ]}
          />
        </View>
      </GestureDetector>

      <View style={styles.labels} pointerEvents="box-none">
        {Array.from({ length: Math.round((max - MIN) / 0.5) + 1 }, (_, i) => {
          const v = MIN + i * 0.5;
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Set ${speedLabel(v)}`}
              style={[styles.label, { left: `${fraction(v) * 100}%` }]}>
              <Txt
                variant="small"
                secondary={Math.abs(v - shown) > 0.001}
                color={Math.abs(v - shown) < 0.001 ? theme.accent : undefined}>
                {speedLabel(v)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.four },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
  },
  value: { minWidth: 110, textAlign: 'center', fontVariant: ['tabular-nums'] },
  step: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: { height: 48, justifyContent: 'center', marginTop: Spacing.three },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  ticks: { position: 'absolute', left: 0, right: 0, top: 30, height: 12 },
  tick: { position: 'absolute', width: 2, marginLeft: -1, borderRadius: 1 },
  thumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10, top: 14 },
  thumbActive: { width: 26, height: 26, borderRadius: 13, top: 11 },
  labels: { height: 22, marginTop: 2 },
  label: { position: 'absolute', width: 44, marginLeft: -22, alignItems: 'center' },
});
