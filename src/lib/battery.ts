import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { PlayerCore } from '@modules/player-core/src';

/**
 * Whether Android's battery saving leaves Caster alone. Some phones (and the battery optimiser
 * on most) stop background checks, downloads and transcription when the app is closed.
 */
export function isBackgroundAllowed(): boolean {
  return PlayerCore?.isIgnoringBatteryOptimizations() ?? true;
}

/** Shows Android's own "let Caster run in the background?" dialog. */
export function askToRunInBackground() {
  PlayerCore?.requestIgnoreBatteryOptimizations();
}

function subscribe(listener: () => void) {
  // Checked again when Caster comes back from the system dialog or settings.
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') listener();
  });
  return () => sub.remove();
}

/** Whether background work is allowed, kept current as the user changes it. */
export function useBackgroundAllowed(): boolean {
  return useSyncExternalStore(subscribe, isBackgroundAllowed);
}
