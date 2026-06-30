'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useToast } from '@/hooks/useToast';
import { offlineStatusToastSchema } from '@/lib/offlineStatusSchema';
import { processQueue, subscribeToQueue } from '@/lib/networkQueue';

/**
 * Offline Status Banner Component
 *
 * Surfaces connectivity changes to the user and visualises the shared offline
 * retry queue (see {@link file://./../lib/networkQueue.ts}). While offline the
 * banner reports how many actions are waiting to be replayed; when connectivity
 * is restored it flushes the queue and shows a transient "reconnecting" state
 * until every queued action has been replayed.
 *
 * Behaviour:
 * 1. **Offline**: a red, `role="status"` banner announces the outage and, when
 *    present, the number of queued actions.
 * 2. **Reconnecting**: once back online with a non-empty queue, the queue is
 *    flushed via `processQueue()` and an informational banner is shown until the
 *    queue drains.
 * 3. **Online & idle**: nothing is rendered.
 *
 * Accessibility: the live region is `aria-live="polite"` / `aria-atomic` and
 * carries an explicit label; decorative icons are `aria-hidden`. Colours use CSS
 * design tokens so the banner respects the active Stellar Wave theme.
 */
export default function OfflineStatusBanner() {
  const { isOnline, wasOffline, resetWasOffline } = useOnlineStatus();
  const { addToast } = useToast();
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Number of read requests parked in the shared offline retry queue.
  const [queuedCount, setQueuedCount] = useState(0);
  // True between coming back online and the retry queue fully draining.
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Mirror the shared retry queue so the banner reflects how many actions are
  // pending. subscribeToQueue invokes the callback immediately with the current
  // depth and again on every change, returning an unsubscribe function.
  useEffect(() => {
    const unsubscribe = subscribeToQueue((count) => setQueuedCount(count));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      return;
    }

    if (wasOffline) {
      // Show toast when coming back online
      const toastOptions = {
        message:
          'Your connection has been restored. Queued messages will be sent.',
        severity: 'success',
        durationMs: 3000,
      };

      // Validate toast options with Zod
      const result = offlineStatusToastSchema.safeParse(toastOptions);

      if (result.success) {
        addToast(result.data);
      } else {
        const errorMessage =
          result.error.issues[0]?.message || 'Connection restored';
        console.error(
          'OfflineStatusBanner: Invalid toast options',
          result.error.format(),
        );
        addToast(errorMessage);
      }

      // Flush the offline retry queue. If anything is pending, surface a
      // transient "reconnecting" banner until the queue drains.
      if (queuedCount > 0) {
        setIsReplaying(true);
        void processQueue();
      }

      setShowBanner(false);
      resetWasOffline();
    }
  }, [isOnline, wasOffline, queuedCount, addToast, resetWasOffline]);

  // Clear the reconnecting indicator once the queue has been fully replayed.
  useEffect(() => {
    if (isReplaying && queuedCount === 0) {
      setIsReplaying(false);
    }
  }, [isReplaying, queuedCount]);

  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 z-50 border-b-2 shadow-md bg-[var(--color-surface)] border-[var(--color-border)]"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-5 h-5 rounded bg-[var(--color-surface-muted)] animate-pulse" />
          <div className="flex-1 h-4 rounded bg-[var(--color-surface-muted)] animate-pulse" />
          <div className="w-5 h-5 rounded bg-[var(--color-surface-muted)] animate-pulse" />
        </div>
      </div>
    );
  }

  // Reconnecting: online again but still replaying queued actions.
  if (!showBanner && isReplaying) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Reconnecting status"
        className="fixed top-0 left-0 right-0 z-50 border-b-2 shadow-md bg-[var(--color-surface-elevated)] border-[var(--color-border)]"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="shrink-0" aria-hidden="true">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-text-primary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Back online. Replaying {queuedCount}{' '}
              {queuedCount === 1 ? 'queued action' : 'queued actions'}…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!showBanner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Offline status"
      className="fixed top-0 left-0 right-0 z-50 border-b-2 shadow-md bg-[var(--color-danger)] border-[var(--color-danger)]"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="shrink-0" aria-hidden="true">
          <WifiOff className="w-5 h-5 animate-pulse text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">
            You are offline. Messages will be sent when you reconnect.
          </p>
          {queuedCount > 0 && (
            <p className="text-xs font-medium text-white opacity-90">
              {queuedCount} {queuedCount === 1 ? 'action' : 'actions'} queued —
              we&apos;ll retry automatically once you&apos;re back online.
            </p>
          )}
        </div>
        <div className="shrink-0" aria-hidden="true">
          <AlertTriangle className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}
