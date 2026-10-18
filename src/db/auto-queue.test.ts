import { episodesToAdd } from './auto-queue';

jest.mock('./library', () => ({ queueEpisode: jest.fn() }));
jest.mock('./settings', () => ({ getSettings: jest.fn() }));

describe('auto-add to Up Next', () => {
  it('adds new episodes oldest first while there is room', () => {
    expect(episodesToAdd([11, 12, 13], 5, 50)).toEqual([11, 12, 13]);
  });

  it('stops at the limit, never pushing out what you queued', () => {
    expect(episodesToAdd([11, 12, 13], 48, 50)).toEqual([11, 12]);
    expect(episodesToAdd([11, 12, 13], 50, 50)).toEqual([]);
    expect(episodesToAdd([11, 12, 13], 60, 50)).toEqual([]);
  });
});
