interface ServiceWorkerOptions {
  scope?: string;
}

const baseUrl = (): string => (import.meta.env?.BASE_URL as string) ?? '/';

export function registerServiceWorker(
  path = baseUrl() + 'sw.js',
  options: ServiceWorkerOptions = { scope: baseUrl() }
): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(path, options).catch((err) => {
      try {
        console.warn('[sw] registration failed', err);
      } catch (_) {}
    });
  });
  return true;
}
