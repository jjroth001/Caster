import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { getSettings, setSetting, type Settings } from './settings';
import { useDbQuery } from './use-db-query';

export function useSettings() {
  return useDbQuery(['setting'], getSettings);
}

/** Returns a function that saves one setting (screens update through the change listener). */
export function useSetSetting() {
  const db = useSQLiteContext();
  return useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => setSetting(db, key, value),
    [db],
  );
}
