import Svg, { Path } from 'react-native-svg';

import { PHOSPHOR, type IconName } from './phosphor-paths';

export type { IconName } from './phosphor-paths';

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  /** The soft background shape; off for small inline icons. */
  duotone?: boolean;
};

/** A Phosphor icon (MIT), duotone or filled, in any colour. */
export function Icon({ name, size = 24, color, duotone = true }: IconProps) {
  const { duo, solid } = PHOSPHOR[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256" accessible={false}>
      {duotone && duo.map((d) => <Path key={d} d={d} fill={color} opacity={0.2} />)}
      {solid.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}
