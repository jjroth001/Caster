import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from '@/components/artwork';
import { Button, Card, Chip } from '@/components/controls';
import { Icon } from '@/components/icons/icon';
import { SubScreen } from '@/components/sub-screen';
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Txt variant="bodyBold">{label}</Txt>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

/** Create or edit a smart playlist; the count updates as the rules change. */
export default function PlaylistEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.six }}
        keyboardShouldPersistTaps="handled">
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          placeholder="Playlist name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.name, { color: theme.text, backgroundColor: theme.element }]}
        />
        <Card style={styles.card}>
          <Field label="Podcasts">
            <Chip
              label="All followed"
              selected={r.podcasts === 'all'}
              onPress={() => set({ podcasts: 'all' })}
            />
            <Chip
              label={r.podcasts === 'all' ? 'Choose…' : `${chosen.size} chosen`}
              selected={r.podcasts !== 'all'}
              onPress={() => {
                if (r.podcasts === 'all') set({ podcasts: [] });
                setChoosing(true);
              }}
            />
          </Field>
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
          <Field label="Status">
            <Chip
              label="Unplayed"
              selected={r.unplayed}
              onPress={() => set({ unplayed: !r.unplayed })}
            />
            <Chip
              label="In progress"
              selected={r.inProgress}
              onPress={() => set({ inProgress: !r.inProgress })}
            />
            <Chip label="Played" selected={r.played} onPress={() => set({ played: !r.played })} />
          </Field>
          <Field label="Released">
            {(
              [
                [null, 'Any time'],
                [1, 'Last 24 h'],
                [3, '3 days'],
                [7, 'Week'],
                [14, '2 weeks'],
                [31, 'Month'],
              ] as const
            ).map(([v, label]) => (
              <Chip
                key={label}
                label={label}
                selected={r.releasedWithinDays === v}
                onPress={() => set({ releasedWithinDays: v })}
              />
            ))}
          </Field>
          <Field label="Length">
            {(
              [
                [null, null, 'Any'],
                [null, 15, 'Under 15 min'],
                [null, 25, 'Under 25 min'],
                [null, 45, 'Under 45 min'],
                [45, null, 'Over 45 min'],
                [60, null, 'Over 1 h'],
              ] as const
            ).map(([min, max, label]) => (
              <Chip
                key={label}
                label={label}
                selected={r.minMinutes === min && r.maxMinutes === max}
                onPress={() => set({ minMinutes: min, maxMinutes: max })}
              />
            ))}
          </Field>
          <Field label="Downloaded">
            <Chip
              label="Any"
              selected={r.downloaded === 'any'}
              onPress={() => set({ downloaded: 'any' })}
            />
            <Chip
              label="Downloaded"
              selected={r.downloaded === 'yes'}
              onPress={() => set({ downloaded: 'yes' })}
            />
            <Chip
              label="Not downloaded"
              selected={r.downloaded === 'no'}
              onPress={() => set({ downloaded: 'no' })}
            />
          </Field>
          <Field label="Type">
            <Chip
              label="Any"
              selected={r.mediaType === 'any'}
              onPress={() => set({ mediaType: 'any' })}
            />
            <Chip
              label="Audio"
              selected={r.mediaType === 'audio'}
              onPress={() => set({ mediaType: 'audio' })}
            />
            <Chip
              label="Video"
              selected={r.mediaType === 'video'}
              onPress={() => set({ mediaType: 'video' })}
            />
          </Field>
          <Field label="Order">
            {(
              [
                ['newest', 'Newest'],
                ['oldest', 'Oldest'],
                ['shortest', 'Shortest'],
                ['longest', 'Longest'],
              ] as const
            ).map(([v, label]) => (
              <Chip
                key={v}
                label={label}
                selected={r.sort === v}
                onPress={() => set({ sort: v })}
              />
            ))}
          </Field>
          <View style={styles.switchRow}>
            <Txt variant="bodyBold" style={styles.flex}>
              Starred only
            </Txt>
            <Switch
              value={r.starredOnly}
              onValueChange={(starredOnly) => set({ starredOnly })}
              trackColor={{ true: theme.accent, false: theme.track }}
              thumbColor={theme.dark ? '#ddd' : '#fff'}
            />
          </View>
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
  card: { marginHorizontal: Spacing.three, paddingVertical: Spacing.two },
  field: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  count: { textAlign: 'center', marginTop: Spacing.three },
  save: { marginHorizontal: Spacing.four, marginTop: Spacing.three },
});
