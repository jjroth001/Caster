/**
 * The categories Discover offers, with Apple's ids for their top lists and the names feeds use
 * for them (itunes:category). "For you" puts the ones your shows belong to first.
 */

export type Category = { id: string; title: string; feedNames: string[] };

export const CATEGORIES: Category[] = [
  { id: '1303', title: 'Comedy', feedNames: ['Comedy'] },
  { id: '1489', title: 'News', feedNames: ['News'] },
  { id: '1324', title: 'Society & Culture', feedNames: ['Society & Culture'] },
  { id: '1487', title: 'History', feedNames: ['History'] },
  { id: '1488', title: 'True Crime', feedNames: ['True Crime'] },
  { id: '1533', title: 'Science', feedNames: ['Science'] },
  { id: '1512', title: 'Health & Fitness', feedNames: ['Health & Fitness'] },
  { id: '1321', title: 'Business', feedNames: ['Business'] },
  { id: '1318', title: 'Technology', feedNames: ['Technology'] },
  { id: '1498', title: 'Language Learning', feedNames: ['Language Learning'] },
  // Language Learning sits inside Education, so Education leaves it out when counting.
  { id: '1304', title: 'Education', feedNames: ['Education'] },
  { id: '1314', title: 'Religion & Spirituality', feedNames: ['Religion & Spirituality'] },
  { id: '1545', title: 'Sports', feedNames: ['Sports'] },
  { id: '1309', title: 'TV & Film', feedNames: ['TV & Film'] },
  { id: '1301', title: 'Arts', feedNames: ['Arts'] },
  { id: '1483', title: 'Fiction', feedNames: ['Fiction'] },
  { id: '1310', title: 'Music', feedNames: ['Music'] },
  { id: '1502', title: 'Leisure', feedNames: ['Leisure'] },
  { id: '1305', title: 'Kids & Family', feedNames: ['Kids & Family'] },
];

/**
 * Categories ordered by how many of your shows belong to them (then in the usual order), from
 * each followed show's category list. A show in "Education > Language Learning" counts for
 * Language Learning only, since that says more about it.
 */
export function categoriesForYou(showCategories: string[][]): Category[] {
  const counts = new Map<string, number>();
  for (const names of showCategories) {
    const mine = CATEGORIES.filter((c) => c.feedNames.some((n) => names.includes(n)));
    const specific = mine.filter((c) => !(c.id === '1304' && mine.some((m) => m.id === '1498')));
    for (const c of specific) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  }
  return CATEGORIES.map((c, i) => ({ c, i, n: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c);
}
