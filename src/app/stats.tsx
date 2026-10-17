import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Card } from '@/components/controls';
import { PickerRow } from '@/components/picker-row';
import { SubScreen } from '@/components/sub-screen';
import { Txt } from '@/components/text';
import { useDbQuery } from '@/db/use-db-query';
import { span } from '@/lib/format';
import { loadStats } from '@/player/stats';
import { useTheme } from '@/theme/theme-provider';
import { Spacing } from '@/theme/themes';

const RANGES = [
  { days: 7, label: 'This week' },
  { days: 30, label: '30 days' },
  { days: null, label: 'All time' },
] as const;

const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const stats = useDbQuery([], (d) => loadStats(d, range.days), [range.days]).data;
  const saved = stats ? stats.speed + stats.silence + stats.skip : 0;
  const maxDay = Math.max(1, ...(stats?.days.map((d) => d.listened) ?? [1]));
  const maxTop = Math.max(1, ...(stats?.top.map((t) => t.listened) ?? [1]));

  // The last 14 days, including ones with no listening.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = today.getTime() - (13 - i) * 86_400_000;
    return { day, listened: stats?.days.find((d) => d.day === day)?.listened ?? 0 };
  });

  return (
    <SubScreen title="Listening stats">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.six }}>
        <Card style={styles.rangeCard}>
          <PickerRow
            label="Showing"
            options={RANGES.map((r) => ({ value: r.label, label: r.label }))}
            value={range.label}
            onChange={(label) => setRange(RANGES.find((r) => r.label === label) ?? RANGES[0])}
          />
        </Card>

        <Card style={styles.card}>
          <Txt variant="meta" secondary>
            Listened
          </Txt>
          <Txt variant="title">{span(stats?.listened ?? 0)}</Txt>
          <Txt variant="small" secondary>
            Caster saved you {span(saved)}
          </Txt>
          <View style={styles.savedRows}>
            {[
              ['Playback speed', stats?.speed ?? 0],
              ['Trim silence', stats?.silence ?? 0],
              ['Skipped intros, outros, chapters and ads', stats?.skip ?? 0],
            ].map(([label, value]) => (
              <View key={label as string} style={styles.savedRow}>
                <Txt variant="small" style={styles.flex}>
                  {label}
                </Txt>
                <Txt variant="smallBold">{span(value as number)}</Txt>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.card}>
          <Txt variant="meta" secondary style={styles.cardTitle}>
            Last two weeks
          </Txt>
          <View
            style={styles.chart}
            accessible
            accessibilityLabel="Minutes listened per day, last two weeks">
            {days.map((d) => (
              <View key={d.day} style={styles.barWrap}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: `${(d.listened / maxDay) * 100}%`, backgroundColor: theme.accent },
                      d.listened === 0 && { height: 2, backgroundColor: theme.track },
                    ]}
                  />
                </View>
                <Txt variant="small" secondary style={styles.dayLabel}>
                  {DAY[new Date(d.day).getDay()]}
                </Txt>
              </View>
            ))}
          </View>
        </Card>

        {!!stats?.top.length && (
          <Card style={styles.card}>
            <Txt variant="meta" secondary style={styles.cardTitle}>
              Top podcasts
            </Txt>
            {stats.top.map((t) => (
              <View key={t.title} style={styles.topRow}>
                <Artwork uri={t.artwork} title={t.title} size={40} radius={8} />
                <View style={styles.flex}>
                  <Txt variant="bodyBold" numberOfLines={1}>
                    {t.title}
                  </Txt>
                  <View style={[styles.topTrack, { backgroundColor: theme.track }]}>
                    <View
                      style={[
                        styles.topBar,
                        { width: `${(t.listened / maxTop) * 100}%`, backgroundColor: theme.accent },
                      ]}
                    />
                  </View>
                </View>
                <Txt variant="small" secondary>
                  {span(t.listened)}
                </Txt>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rangeCard: { marginHorizontal: Spacing.three, marginBottom: Spacing.three, overflow: 'hidden' },
  card: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    gap: 4,
  },
  cardTitle: { marginBottom: Spacing.two },
  savedRows: { marginTop: Spacing.three, gap: Spacing.two },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chart: { flexDirection: 'row', height: 120, alignItems: 'flex-end', gap: 4 },
  barWrap: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3 },
  dayLabel: { marginTop: 4, fontSize: 11 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 6 },
  topTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  topBar: { height: 4, borderRadius: 2 },
});
