import { fetchWithTimeout, TimeoutError } from './http';

describe('fetchWithTimeout', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('gives up on a server that never answers, with a clear message', async () => {
    jest.useFakeTimers();
    // A request that hangs until it's cancelled, like a stalled server.
    global.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as typeof fetch;
    const request = fetchWithTimeout('https://example.org/slow', {}, 15_000, 'Too slow.');
    jest.advanceTimersByTime(15_000);
    await expect(request).rejects.toBeInstanceOf(TimeoutError);
    await expect(request).rejects.toThrow('Too slow.');
  });

  it('passes answers through', async () => {
    global.fetch = jest.fn(async () => new Response('ok')) as typeof fetch;
    const response = await fetchWithTimeout('https://example.org/fast');
    expect(await response.text()).toBe('ok');
  });
});
