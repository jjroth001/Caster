import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import { PlayerCore } from './index';

/**
 * The playing episode's video, drawn by Media3. null in Expo Go (no custom native views),
 * where video episodes play as audio.
 */
export const VideoSurface: ComponentType<ViewProps> | null = PlayerCore
  ? requireNativeView<ViewProps>('PlayerCore')
  : null;
