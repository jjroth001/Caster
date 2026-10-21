import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Artwork } from '@/components/artwork';
import { Txt } from '@/components/text';
import type { DirectoryPodcast } from '@/feeds/apple';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const INSET = Spacing.four;
const GAP = Spacing.three;
const ACROSS = 3;

type Props = {
  title: string;
  /** A line under the title ("Picked by …"). */
  note?: string;
  /** Null while loading: three soft placeholders. */
  items: DirectoryPodcast[] | null;
  onSeeAll?: () => void;
  onOpen: (item: DirectoryPodcast) => void;
  /** The show being opened, which gets a spinner. */
  opening: string | null;
};

/**
 * A titled row of shows that scrolls sideways, settling three across. Each show fades in as it
 * rolls on and fades out as it rolls off, so nothing is left cut off at the edges.
 */
export function ShowRow({ title, note, items, onSeeAll, onOpen, opening }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - INSET * 2 - GAP * (ACROSS - 1)) / ACROSS);
  const step = size + GAP;
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  return (
    <View style={styles.row}>
      <View style={styles.heading}>
        <View style={styles.headingText}>
          <Txt variant="bodyBold" style={styles.title} numberOfLines={1}>
            {title}
          </Txt>
          {note ? (
            <Txt variant="small" secondary numberOfLines={1}>
              {note}
            </Txt>
          ) : null}
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={10} accessibilityRole="button">
            <Txt variant="smallBold" color={theme.accent}>
              See all
            </Txt>
          </Pressable>
        )}
      </View>
      {items == null ? (
        <View style={styles.placeholders}>
          {Array.from({ length: ACROSS }, (_, i) => (
            <View
              key={i}
              style={{
                width: size,
                height: size,
                borderRadius: Radius.medium,
                backgroundColor: theme.element,
              }}
            />
          ))}
        </View>
      ) : (
        <Reanimated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          snapToInterval={step}
          decelerationRate="fast"
          contentContainerStyle={styles.content}>
          {items.map((item, index) => (
            <Tile
              key={item.appleId}
              item={item}
              index={index}
              size={size}
              step={step}
              windowWidth={width - INSET * 2}
              scrollX={scrollX}
              opening={opening === item.appleId}
              onOpen={onOpen}
            />
          ))}
        </Reanimated.ScrollView>
      )}
    </View>
  );
}

function Tile({
  item,
  index,
  size,
  step,
  windowWidth,
  scrollX,
  opening,
  onOpen,
}: {
  item: DirectoryPodcast;
  index: number;
  size: number;
  step: number;
  windowWidth: number;
  scrollX: SharedValue<number>;
  opening: boolean;
  onOpen: (item: DirectoryPodcast) => void;
}) {
  // How much of the show is inside the row (between the side margins) sets how clear it is.
  const fade = useAnimatedStyle(() => {
    const left = index * step - scrollX.value;
    const inside = Math.max(0, Math.min(left + size, windowWidth) - Math.max(left, 0)) / size;
    return { opacity: Math.pow(inside, 1.4) };
  });
  return (
    <Reanimated.View style={[{ width: size, marginRight: GAP }, fade]}>
      <Pressable
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={item.author ? `${item.title} by ${item.author}` : item.title}
        style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <View>
          <Artwork uri={item.artworkUrl} title={item.title} size={size} radius={Radius.medium} />
          {opening && (
            <View style={[styles.opening, { borderRadius: Radius.medium }]}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
        </View>
        <Txt variant="smallBold" numberOfLines={1} style={styles.showTitle}>
          {item.title}
        </Txt>
        <Txt variant="small" secondary numberOfLines={1}>
          {item.author}
        </Txt>
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: Spacing.four },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
    marginHorizontal: INSET,
    marginBottom: Spacing.two + 2,
  },
  headingText: { flex: 1, gap: 2 },
  title: { fontSize: 18 },
  content: { paddingLeft: INSET, paddingRight: INSET - GAP },
  placeholders: { flexDirection: 'row', gap: GAP, marginHorizontal: INSET },
  showTitle: { marginTop: Spacing.two },
  opening: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
