import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Artwork } from '@/components/artwork';
import { Button, Card } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { PickerRow, RowDivider, SettingRow } from '@/components/picker-row';
import { SubScreen } from '@/components/sub-screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { Txt } from '@/components/text';
import { listLibrary } from '@/db/library';
import {
  createPlaylist,
  DEFAULT_RULES,
  getPlaylist,
  parseRules,
  playlistEpisodes,
  updatePlaylist,
  type SmartRules,
} from '@/db/playlists';
import { useDbQuery } from '@/db/use-db-query';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

/** Create or edit a smart playlist; the count updates as the rules change. */
export default function PlaylistEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const theme = useTheme();
  const tabSpace = useTabBarSpace();
  const [draft, setDraft] = useState<{ name: string; rules: SmartRules } | null>(
    editingId == null ? { name: '', rules: DEFAULT_RULES } : null,
  );
  const [choosing, setChoosing] = useState(false);

  // Load the playlist being edited once.
  useDbQuery(
    [],
    async (d) => {
      if (editingId == null || draft) return null;
      const p = await getPlaylist(d, editingId);
      if (p) setDraft({ name: p.name, rules: parseRules(p.rules_json) });
      return null;
    },
    [editingId],
  );
  const podcasts = useDbQuery(['podcast'], (d) => listLibrary(d, 'title')).data ?? [];
  const count = useDbQuery(
    ['episode', 'episode_state', 'podcast'],
    async (d) =>
      draft
        ? (
            await playlistEpisodes(d, {
              id: 0,
              name: '',
              type: 'smart',
              rules_json: JSON.stringify(draft.rules),
              sort_order: 0,
              created_at: 0,
            })
          ).length
        : 0,
    [JSON.stringify(draft?.rules)],
  ).data;

  if (!draft) return <SubScreen title="Smart playlist">{null}</SubScreen>;
  const toggle = (value: boolean, onChange: (v: boolean) => void) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: theme.accent, false: theme.track }}
      thumbColor={theme.dark ? '#ddd' : '#fff'}
    />
  );
  const r = draft.rules;
  const set = (patch: Partial<SmartRules>) => setDraft({ ...draft, rules: { ...r, ...patch } });
  const chosen = new Set(r.podcasts === 'all' ? [] : r.podcasts);

  const save = async () => {
    const name = draft.name.trim() || 'Smart playlist';
    if (editingId == null) {
      const newId = await createPlaylist(db, name, 'smart', r);
      router.replace(`/playlist/${newId}`);
    } else {
      await updatePlaylist(db, editingId, name, r);
      router.back();
    }
  };

  return (
    <SubScreen title={editingId == null ? 'New smart playlist' : 'Edit smart playlist'}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabSpace + Spacing.two }}
        keyboardShouldPersistTaps="handled">
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          placeholder="Playlist name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.name, { color: theme.text, backgroundColor: theme.element }]}
        />
        <Card style={styles.card}>
          <PickerRow
            label="Podcasts"
            options={[
              { value: 'all', label: 'All followed' },
              { value: 'chosen', label: 'Only the ones I choose' },
            ]}
            value={r.podcasts === 'all' ? 'all' : 'chosen'}
            valueLabel={r.podcasts === 'all' ? 'All followed' : `${chosen.size} chosen`}
            onChange={(v) => {
              if (v === 'all') {
                set({ podcasts: 'all' });
                setChoosing(false);
              } else {
                if (r.podcasts === 'all') set({ podcasts: [] });
                setChoosing(true);
              }
            }}
          />
          {r.podcasts !== 'all' && !choosing && (
            <Pressable
              onPress={() => setChoosing(true)}
              accessibilityRole="button"
              style={styles.chooseLink}>
              <Txt variant="smallBold" color={theme.accent}>
                Change which podcasts
              </Txt>
            </Pressable>
          )}
          {choosing && r.podcasts !== 'all' && (
            <View style={styles.podcastList}>
              {podcasts.map((p) => {
                const on = chosen.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      set({
                        podcasts: on ? [...chosen].filter((x) => x !== p.id) : [...chosen, p.id],
                      })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={styles.podcastRow}>
                    <Artwork uri={p.artwork_url} title={p.title} size={36} radius={8} />
                    <Txt style={styles.flex} numberOfLines={1}>
                      {p.title}
                    </Txt>
                    <View
                      style={[
                        styles.check,
                        { borderColor: on ? theme.accent : theme.textSecondary },
                        on && { backgroundColor: theme.accent },
                      ]}>
                      {on && <Icon name="check" size={14} color={theme.onAccent} duotone={false} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          <RowDivider />
          <SettingRow label="Unplayed">
            {toggle(r.unplayed, (unplayed) => set({ unplayed }))}
          </SettingRow>
          <RowDivider />
          <SettingRow label="In progress">
            {toggle(r.inProgress, (inProgress) => set({ inProgress }))}
          </SettingRow>
          <RowDivider />
          <SettingRow label="Played">{toggle(r.played, (played) => set({ played }))}</SettingRow>
          <RowDivider />
          <SettingRow label="Starred only">
            {toggle(r.starredOnly, (starredOnly) => set({ starredOnly }))}
          </SettingRow>
          <RowDivider />
          <PickerRow
            label="Released"
            options={[
              { value: null as number | null, label: 'Any time' },
              { value: 1, label: 'In the last 24 hours' },
              { value: 3, label: 'In the last 3 days' },
              { value: 7, label: 'In the last week' },
              { value: 14, label: 'In the last 2 weeks' },
              { value: 31, label: 'In the last month' },
            ]}
            value={r.releasedWithinDays}
            onChange={(releasedWithinDays) => set({ releasedWithinDays })}
          />
          <RowDivider />
          <PickerRow
            label="Length"
            options={LENGTHS.map((l) => ({ value: l.key, label: l.label }))}
            value={
              LENGTHS.find((l) => l.min === r.minMinutes && l.max === r.maxMinutes)?.key ?? 'any'
            }
            onChange={(key) => {
              const l = LENGTHS.find((x) => x.key === key)!;
              set({ minMinutes: l.min, maxMinutes: l.max });
            }}
          />
          <RowDivider />
          <PickerRow
            label="Downloaded"
            options={[
              { value: 'any' as const, label: 'Either' },
              { value: 'yes' as const, label: 'Downloaded only' },
              { value: 'no' as const, label: 'Not downloaded' },
            ]}
            value={r.downloaded}
            onChange={(downloaded) => set({ downloaded })}
          />
          <RowDivider />
          <PickerRow
            label="Type"
            options={[
              { value: 'any' as const, label: 'Audio and video' },
              { value: 'audio' as const, label: 'Audio only' },
              { value: 'video' as const, label: 'Video only' },
            ]}
            value={r.mediaType}
            onChange={(mediaType) => set({ mediaType })}
          />
          <RowDivider />
          <PickerRow
            label="Order"
            options={[
              { value: 'newest' as const, label: 'Newest first' },
              { value: 'oldest' as const, label: 'Oldest first' },
              { value: 'shortest' as const, label: 'Shortest first' },
              { value: 'longest' as const, label: 'Longest first' },
            ]}
            value={r.sort}
            onChange={(sort) => set({ sort })}
          />
        </Card>
        <Txt variant="small" secondary style={styles.count}>
          {count == null
            ? ' '
            : `${count === r.limit ? `${count}+` : count} episode${count === 1 ? '' : 's'} match right now`}
        </Txt>
        <Button label="Save" onPress={() => void save()} style={styles.save} />
      </ScrollView>
    </SubScreen>
  );
}

const LENGTHS = [
  { key: 'any', min: null, max: null, label: 'Any length' },
  { key: 'u15', min: null, max: 15, label: 'Under 15 minutes' },
  { key: 'u25', min: null, max: 25, label: 'Under 25 minutes' },
  { key: 'u45', min: null, max: 45, label: 'Under 45 minutes' },
  { key: 'o45', min: 45, max: null, label: 'Over 45 minutes' },
  { key: 'o60', min: 60, max: null, label: 'Over an hour' },
] as const;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  name: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 17,
  },
  card: { marginHorizontal: Spacing.three, paddingVertical: Spacing.one, overflow: 'hidden' },
  chooseLink: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  podcastList: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  podcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 6,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { textAlign: 'center', marginTop: Spacing.three },
  save: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
