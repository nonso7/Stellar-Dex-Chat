import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCache,
  getContractBalance,
  getBridgeLimit,
  getTotalDeposited,
} from '@/lib/stellarContract';

export type BridgeStats = {
  balance: bigint | null;
  limit: bigint | null;
  totalDeposited: bigint | null;
  loading: boolean;
  error: string | null;
  fetchCount: number;
  lastFetchedAt: Date | null;
  refetchStats: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Minimal telemetry sink — swap for a real analytics provider as needed.
function trackTelemetry(event: string, meta?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    // Emit a custom DOM event so tests and analytics shims can intercept it
    // without coupling this hook to a specific vendor SDK.
    window.dispatchEvent(
      new CustomEvent('bridge_stats_telemetry', {
        detail: { event, timestamp: Date.now(), ...meta },
      }),
    );
  } catch {
    // telemetry must never crash the app
  }
}

export default function useBridgeStats(): BridgeStats {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [limit, setLimit] = useState<bigint | null>(null);
  const [totalDeposited, setTotalDeposited] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    trackTelemetry('bridge_stats_mounted');
    return () => {
      isMountedRef.current = false;
      trackTelemetry('bridge_stats_unmounted');
    };
  }, []);

  const refetchStats = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    setError(null);
    const fetchStart = Date.now();
    try {
      const [b, l, t] = await Promise.all([
        getContractBalance(),
        getBridgeLimit(),
        getTotalDeposited(),
      ]);
      if (!isMountedRef.current) return;
      setBalance(b);
      setLimit(l);
      setTotalDeposited(t);
      const now = new Date();
      setLastFetchedAt(now);
      setFetchCount((prev) => prev + 1);
      trackTelemetry('bridge_stats_fetch_success', {
        durationMs: Date.now() - fetchStart,
        balance: b?.toString(),
        limit: l?.toString(),
        totalDeposited: t?.toString(),
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      trackTelemetry('bridge_stats_fetch_error', {
        durationMs: Date.now() - fetchStart,
        error: message,
      });
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    trackTelemetry('bridge_stats_manual_refresh');
    clearCache();
    await refetchStats();
  }, [refetchStats]);

  // Initial fetch and 30-second polling
  useEffect(() => {
    void refetchStats();

    const interval = setInterval(() => {
      void refetchStats();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [refetchStats]);

  return {
    balance,
    limit,
    totalDeposited,
    loading,
    error,
    fetchCount,
    lastFetchedAt,
    refetchStats,
    refresh,
  };
}
