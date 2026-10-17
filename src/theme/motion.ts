import {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  LinearTransition,
} from 'react-native-reanimated';

/**
 * Shared layout animations so everything moves with the same timing. Reanimated follows the
 * system "Remove animations" setting, so these turn off for people who've asked for less motion.
 */
export const Motion = {
  enter: FadeInDown.duration(220),
  exit: FadeOut.duration(160),
  fadeIn: FadeIn.duration(200),
  layout: LinearTransition.duration(220),
  rise: FadeInDown.duration(220),
  sink: FadeOutDown.duration(180),
};
