import { overLimit, planAutoDownloadUpgrade } from './auto-download';

describe('overLimit', () => {
  const downloads = [
    { id: 5, keep: false },
    { id: 4, keep: false },
    { id: 3, keep: true },
    { id: 2, keep: false },
    { id: 1, keep: false },
  ];

  it('removes automatic downloads beyond the newest N', () => {
    expect(overLimit(downloads, 2, new Set())).toEqual([2, 1]);
  });

  it('keeps ones that are queued, playing, half-listened or starred, and playlist picks', () => {
    expect(overLimit(downloads, 1, new Set([1]))).toEqual([4, 2]);
  });

  it('removes nothing within the limit', () => {
    expect(overLimit(downloads, 10, new Set())).toEqual([]);
  });
});

describe('planAutoDownloadUpgrade', () => {
  it('chooses every podcast that followed an old global setting', () => {
    expect(
      planAutoDownloadUpgrade(3, [
        { id: 1, n: null },
        { id: 2, n: 0 },
        { id: 3, n: 1 },
      ]),
    ).toEqual({ enabled: true, limit: 3, chosen: [1, 3], notChosen: [2] });
  });

  it('keeps per-podcast choices when the global setting was off', () => {
    expect(
      planAutoDownloadUpgrade(0, [
        { id: 1, n: null },
        { id: 2, n: 5 },
      ]),
    ).toEqual({ enabled: true, limit: 5, chosen: [2], notChosen: [1] });
  });

  it('leaves auto-download off for someone who never used it', () => {
    expect(planAutoDownloadUpgrade(0, [{ id: 1, n: null }])).toEqual({
      enabled: false,
      limit: 2,
      chosen: [],
      notChosen: [1],
    });
  });
});
