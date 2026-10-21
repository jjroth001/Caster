import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Reanimated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { SwipeHost } from '@modules/player-core/src/SwipeHost';
import { Artwork } from '@/components/artwork';
import { Icon } from '@/components/icons/icon';
import { Txt } from '@/components/text';
import type { DirectoryPodcast } from '@/feeds/apple';
import { useTheme } from '@/theme/theme-provider';
import { Radius, Spacing } from '@/theme/themes';

const INSET = Spacing.four;
const GAP = Spacing.three;
const ACROSS = 3;
const ARROW = 40;

/**
 * How clear something in a sideways row is: fully inside the row (between the side margins)
 * it's solid, and it fades as it rolls past either edge. `left` and `width` are its place in
 * the row's content, not counting the left margin.
 */
function useEdgeFade(scrollX: SharedValue<number>, left: number, width: number, inner: number) {
  return useAnimatedStyle(() => {
    if (width <= 0) return { opacity: 0 };
    const x = left - scrollX.value;
    const inside = Math.max(0, Math.min(x + width, inner) - Math.max(x, 0)) / width;
    return { opacity: Math.pow(inside, 1.4) };
  });
}

type Props = {
  title: string;
  /** A line under the title ("Picked by …"). */
  note?: string;
  /** Null while loading: three soft placeholders. */
  items: DirectoryPodcast[] | null;
  onSeeAll?: () => void;
  onOpen: (item: DirectoryPodcast) => void;
};

/**
 * A titled row of shows that scrolls sideways, settling three across. Each show fades in as it
 * rolls on and out as it rolls off, so nothing is left cut off at the edges. Round arrows at
 * the ends show there's more and move three shows along when tapped.
 */
export function ShowRow({ title, note, items, onSeeAll, onOpen }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const inner = width - INSET * 2;
  const size = Math.floor((inner - GAP * (ACROSS - 1)) / ACROSS);
  const step = size + GAP;
  const maxScroll = Math.max(0, ((items?.length ?? 0) - ACROSS) * step);
  const scrollX = useSharedValue(0);
  const scroller = useRef<Reanimated.ScrollView>(null);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  // The arrows fade in when there's more that way; once nearly gone they also stop taking taps.
  const backStyle = useAnimatedStyle(() => {
    const o = Math.min(1, scrollX.value / (step / 2));
    return { opacity: o, transform: [{ scale: o < 0.05 ? 0 : 1 }] };
  });
  const nextStyle = useAnimatedStyle(() => {
    const o = Math.min(1, Math.max(0, (maxScroll - scrollX.value) / (step / 2)));
    return { opacity: o, transform: [{ scale: o < 0.05 ? 0 : 1 }] };
  });
  const move = (direction: 1 | -1) => {
    const here = Math.round(scrollX.value / step) * step;
    const x = Math.min(maxScroll, Math.max(0, here + direction * ACROSS * step));
    scroller.current?.scrollTo({ x, animated: true });
  };

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
        <View>
          <SwipeHost>
            <Reanimated.ScrollView
              ref={scroller}
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
                  left={index * step}
                  size={size}
                  inner={inner}
                  scrollX={scrollX}
                  onOpen={onOpen}
                />
              ))}
            </Reanimated.ScrollView>
          </SwipeHost>
          <Arrow
            side="left"
            top={size / 2 - ARROW / 2}
            style={backStyle}
            onPress={() => move(-1)}
          />
          <Arrow
            side="right"
            top={size / 2 - ARROW / 2}
            style={nextStyle}
            onPress={() => move(1)}
          />
        </View>
      )}
    </View>
  );
}

function Arrow({
  side,
  top,
  style,
  onPress,
}: {
  side: 'left' | 'right';
  top: number;
  style: ComponentProps<typeof Reanimated.View>['style'];
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Reanimated.View
      style={[styles.arrow, { top, [side]: INSET - ARROW / 2 }, style]}
      pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={side === 'left' ? 'Back' : 'More'}
        style={[
          styles.arrowButton,
          { backgroundColor: theme.tabBar, borderColor: theme.tabBarBorder },
        ]}>
        <Icon
          name={side === 'left' ? 'caret-left' : 'caret-right'}
          size={20}
          color={theme.text}
          duotone={false}
        />
      </Pressable>
    </Reanimated.View>
  );
}

function Tile({
  item,
  left,
  size,
  inner,
  scrollX,
  onOpen,
}: {
  item: DirectoryPodcast;
  left: number;
  size: number;
  inner: number;
  scrollX: SharedValue<number>;
  onOpen: (item: DirectoryPodcast) => void;
}) {
  const fade = useEdgeFade(scrollX, left, size, inner);
  return (
    <Reanimated.View style={[{ width: size, marginRight: GAP }, fade]}>
      <Pressable
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={item.author ? `${item.title} by ${item.author}` : item.title}
        style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Artwork uri={item.artworkUrl} title={item.title} size={size} radius={Radius.medium} />
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

/**
 * A row of buttons (Discover's categories) that scrolls sideways like the show rows: any that
 * don't fit fade at the edges instead of being cut off.
 */
export function FadingChips({ children }: { children: (fade: ChipFade) => ReactNode }) {
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });
  const fade: ChipFade = { scrollX, inner: width - INSET * 2 };
  return (
    <SwipeHost>
      <Reanimated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.chips}>
        {children(fade)}
      </Reanimated.ScrollView>
    </SwipeHost>
  );
}

export type ChipFade = { scrollX: SharedValue<number>; inner: number };

/** One button in FadingChips; it measures where it sits so it knows when to fade. */
export function FadingChip({ fade, children }: { fade: ChipFade; children: ReactNode }) {
  const [place, setPlace] = useState({ left: 0, width: 0 });
  const style = useEdgeFade(fade.scrollX, place.left, place.width, fade.inner);
  return (
    <Reanimated.View
      style={style}
      onLayout={(e) =>
        // Measured from the content's edge, which sits one margin in from the row's.
        setPlace({ left: e.nativeEvent.layout.x - INSET, width: e.nativeEvent.layout.width })
      }>
      {children}
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
  arrow: { position: 'absolute', width: ARROW, height: ARROW },
  arrowButton: {
    width: ARROW,
    height: ARROW,
    borderRadius: ARROW / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: Spacing.two, paddingHorizontal: INSET, paddingTop: Spacing.three },
});
