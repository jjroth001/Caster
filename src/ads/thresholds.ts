import type { Settings } from '@/db/settings';

/** How sure Pod Wizard must be that something is an ad before skipping it, per sensitivity. */
export const AD_THRESHOLDS: Record<Settings['adSensitivity'], number> = {
  cautious: 0.95,
  balanced: 0.8,
  eager: 0.6,
};
