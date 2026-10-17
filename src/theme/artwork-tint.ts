import { useEffect, useState } from 'react';

import { PlayerCore } from '@modules/player-core/src';
import { DEFAULT_SETTINGS } from '@/db/settings';
import { useSettings } from '@/db/use-settings';

import { useTheme } from './theme-provider';

const cache = new Map<string, string | null>();

function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const [x, y] = [parse(a), parse(b)];
  return `#${x
    .map((v, i) =>
      Math.round(v * amount + y[i] * (1 - amount))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * A background tint taken from the cover art: always in Midnight, and in the other themes when
 * "Tint from cover art" is on. Softened toward the page colour so text stays readable.
 */
export function useArtworkTint(url: string | null | undefined): string | null {
  const theme = useTheme();
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const enabled = theme.name === 'midnight' || settings.tintFromArtwork;
  // The colour fetched for this cover, kept in state so the screen redraws when it arrives
  // (React Compiler would otherwise keep the first read of the module-level cache).
  const [fetched, setFetched] = useState<{ url: string; color: string | null } | null>(null);
  const color = !url ? null : fetched?.url === url ? fetched.color : (cache.get(url) ?? null);

  useEffect(() => {
    if (!enabled || !url || !PlayerCore || cache.has(url)) return;
    let live = true;
    PlayerCore.artworkColor(url).then(
      (c) => {
        cache.set(url, c);
        if (live) setFetched({ url, color: c });
      },
      () => cache.set(url, null),
    );
    return () => {
      live = false;
    };
  }, [enabled, url]);

  if (!enabled || !color || !/^#[0-9a-f]{6}$/i.test(theme.background)) return null;
  return mix(color, theme.background, theme.dark ? 0.55 : 0.22);
}
