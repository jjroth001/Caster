import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

const PLACEHOLDER_COLORS = [
  '#5E8C61',
  '#3B4BA8',
  '#C9773A',
  '#3F8CA0',
  '#B8566B',
  '#6E6A64',
  '#6A52A8',
  '#9C8A3A',
];

function colorFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return PLACEHOLDER_COLORS[Math.abs(h) % PLACEHOLDER_COLORS.length];
}

type Props = {
  uri: string | null | undefined;
  title: string;
  size: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** A podcast or episode cover; a coloured tile with the first letter while loading or if missing. */
export function Artwork({ uri, title, size, radius = Math.round(size * 0.12), style }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius, backgroundColor: colorFor(title) },
        styles.clip,
        style,
      ]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>
        {title.trim().charAt(0).toUpperCase()}
      </Text>
      {showImage && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  letter: { color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
});
