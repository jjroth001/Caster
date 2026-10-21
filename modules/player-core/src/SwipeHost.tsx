import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import { View, type ViewProps } from 'react-native';

import { PlayerCore } from './index';

/**
 * Wraps a row that scrolls sideways inside the swipeable tabs, so swiping it never switches
 * tabs. A plain View in Expo Go (no custom native views), where the two can still race.
 */
export const SwipeHost: ComponentType<ViewProps> = PlayerCore
  ? requireNativeView<ViewProps>('PlayerCore', 'SwipeHostView')
  : View;
