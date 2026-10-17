import { getEpisode } from '@/db/library';
import { useDbQuery } from '@/db/use-db-query';
import { useSettings } from '@/db/use-settings';

/** The episode in the player, from the library (title, cover, podcast). */
export function useNowPlaying() {
  const id = useSettings().data?.nowPlaying ?? null;
  const query = useDbQuery(
    ['episode', 'episode_state', 'podcast'],
    async (db) => (id == null ? null : getEpisode(db, id)),
    [id],
  );
  return query.data ?? null;
}
