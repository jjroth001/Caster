import { addDatabaseChangeListener, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, type DependencyList } from 'react';

export type Table =
  | 'podcast'
  | 'podcast_settings'
  | 'episode'
  | 'episode_state'
  | 'queue_item'
  | 'folder'
  | 'setting';

const RERUN_DELAY_MS = 40;

export type QueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

/**
 * Runs `query` and re-runs it whenever any of `tables` changes, so screens stay live without
 * manual refreshes. Requires the provider to be opened with `enableChangeListener: true`.
 */
export function useDbQuery<T>(
  tables: readonly Table[],
  query: (db: SQLiteDatabase) => Promise<T>,
  deps: DependencyList = [],
): QueryState<T> {
  const db = useSQLiteContext();
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
    // The listener fires once per changed row; a feed refresh can write hundreds. Coalesce a
    // burst into a single re-query shortly after it ends.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const subscription = addDatabaseChangeListener(({ tableName }) => {
      if (!(tables as readonly string[]).includes(tableName)) return;
      clearTimeout(pending);
      pending = setTimeout(run, RERUN_DELAY_MS);
    });
    return () => {
      disposed = true;
      clearTimeout(pending);
      subscription.remove();
    };
    // `query` and `tables` are expected to be inline; callers list real inputs in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);

  return state;
}
