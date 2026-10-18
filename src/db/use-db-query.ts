import { NavigationContext } from 'expo-router/react-navigation';
import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useContext, useEffect, useState, type DependencyList } from 'react';

export type Table =
  | 'podcast'
  | 'podcast_settings'
  | 'episode'
  | 'episode_state'
  | 'queue_item'
  | 'folder'
  | 'setting'
  | 'chapter'
  | 'bookmark'
  | 'playlist'
  | 'playlist_item'
  | 'transcript'
  | 'ad_segment';

const RERUN_DELAY_MS = 40;

export type QueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

/**
 * Runs `query` and re-runs it whenever any of `tables` changes, so screens stay live without
 * manual refreshes. Requires the provider to be opened with `enableChangeListener: true`.
 *
 * A screen you can't see (another tab, or one under the player or a page on top) doesn't
 * re-query while hidden: it notes the change and catches up once when it's shown again. The
 * player saves its position every few seconds, which would otherwise make every open screen
 * query again. Things outside screens (the mini player, sheets) always stay live.
 */
export function useDbQuery<T>(
  tables: readonly Table[],
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: DependencyList = [],
): QueryState<T> {
  const db = useSQLiteContext();
  const navigation = useContext(NavigationContext);
  const [state, setState] = useState<QueryState<T>>({
    status: 'loading',
    data: undefined,
    error: undefined,
  });

  useEffect(() => {
    let latestRun = 0;
    let disposed = false;

    const run = () => {
      const thisRun = ++latestRun;
      query(db).then(
        (data) => {
          if (!disposed && thisRun === latestRun)
            setState({ status: 'success', data, error: undefined });
        },
        (error: Error) => {
          if (!disposed && thisRun === latestRun)
            setState({ status: 'error', data: undefined, error });
        },
      );
    };

    run();
    let visible = navigation ? navigation.isFocused() : true;
    let stale = false;
    // The listener fires once per changed row; a feed refresh can write hundreds. Coalesce a
    // burst into a single re-query shortly after it ends.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (!(tables as readonly string[]).includes(tableName)) return;
      if (!visible) {
        stale = true;
        return;
      }
      clearTimeout(pending);
      pending = setTimeout(run, RERUN_DELAY_MS);
    });
    const offFocus = navigation?.addListener('focus', () => {
      visible = true;
      if (stale) {
        stale = false;
        run();
      }
    });
    const offBlur = navigation?.addListener('blur', () => {
      visible = false;
    });
    return () => {
      disposed = true;
      clearTimeout(pending);
      subscription.remove();
      offFocus?.();
      offBlur?.();
    };
    // `query` and `tables` are expected to be inline; callers list real inputs in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, navigation, ...deps]);

  return state;
}
