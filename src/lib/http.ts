/**
 * fetch() with a time limit. React Native's fetch has none, so a server that stalls (as Apple's
 * directory does when asked too often) would leave a spinner going forever.
 */

export class TimeoutError extends Error {}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15_000,
  message = 'The server didn’t answer. Check your connection and try again.',
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError(message);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
