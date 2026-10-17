import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { SERIF } from '@/theme/themes';

type Variant = 'title' | 'heading' | 'body' | 'bodyBold' | 'small' | 'smallBold' | 'meta';

const SIZES: Record<
  Variant,
  { fontSize: number; lineHeight: number; fontWeight: '400' | '600' | '700' }
> = {
  title: { fontSize: 32, lineHeight: 40, fontWeight: '400' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyBold: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  smallBold: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  meta: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
};

export type TxtProps = TextProps & {
  variant?: Variant;
  /** Dimmer, for supporting text. */
  secondary?: boolean;
  color?: string;
};

/** Text in the theme's colours; titles and headings use the serif face where the theme has one. */
export function Txt({ variant = 'body', secondary, color, style, ...rest }: TxtProps) {
  const theme = useTheme();
  const size = SIZES[variant];
  const serif = theme.serifTitles && (variant === 'title' || variant === 'heading');
  return (
    <RNText
      style={[
        size,
        serif
          ? { fontFamily: SERIF }
          : (variant === 'title' || variant === 'heading') && { fontWeight: '700' },
        variant === 'meta' && { letterSpacing: 0.6, textTransform: 'uppercase' },
        { color: color ?? (secondary ? theme.textSecondary : theme.text) },
        style,
      ]}
      {...rest}
    />
  );
}
