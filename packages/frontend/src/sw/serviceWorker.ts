/**
 * Service worker registration utility for PWA.
 * The actual service worker file lives in public/service-worker.js.
 * Validates: Requirements 34.2, 35.1
 */

export interface SWConfig {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

export function register(config?: SWConfig): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = `${process.env.PUBLIC_URL || ''}/service-worker.js`;
    registerSW(swUrl, config);
  });
}

async function registerSW(swUrl: string, config?: SWConfig): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(swUrl);

    registration.onupdatefound = () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.onstatechange = () => {
        if (installing.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content available — update callback
            config?.onUpdate?.(registration);
          } else {
            // First install — success callback
            config?.onSuccess?.(registration);
          }
        }
      };
    };
  } catch (err) {
    config?.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

export function unregister(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}
