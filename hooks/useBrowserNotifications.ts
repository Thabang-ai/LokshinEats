'use client';

// useBrowserNotifications
// Thin wrapper around the Web Notifications API. Works without any server
// infrastructure (no FCM, no service worker, no Blaze plan). Limitation:
// notifications only fire while the originating tab is open in some browser
// window. True closed-tab push would need FCM — that's a future upgrade.

import { useCallback, useEffect, useState } from 'react';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<PermissionState>('default');

  // Resolve the current permission on mount. `Notification` is undefined
  // during SSR and in browsers that don't support it (very rare on desktop).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PermissionState);
  }, []);

  const request = useCallback(async (): Promise<PermissionState> => {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      return result as PermissionState;
    } catch {
      return 'denied';
    }
  }, []);

  const notify = useCallback(
    (
      title: string,
      options?: NotificationOptions & { onClickUrl?: string },
    ) => {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;

      try {
        const { onClickUrl, ...nativeOptions } = options ?? {};
        const n = new Notification(title, {
          icon: '/logo.png',
          badge: '/logo.png',
          ...nativeOptions,
        });
        n.onclick = () => {
          window.focus();
          if (onClickUrl) {
            window.location.href = onClickUrl;
          }
          n.close();
        };
      } catch {
        // Some browsers throw if a top-level invocation; safe to swallow.
      }
    },
    [],
  );

  return { permission, request, notify };
}
