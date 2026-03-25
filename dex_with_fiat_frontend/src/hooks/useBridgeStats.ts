import { useCallback, useEffect, useState } from 'react';
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
  refetchStats: () => Promise<void>;
  refresh: () => Promise<void>;
};

export default function useBridgeStats(): BridgeStats {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [limit, setLimit] = useState<bigint | null>(null);
  const [totalDeposited, setTotalDeposited] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, l, t] = await Promise.all([
        getContractBalance(),
        getBridgeLimit(),
        getTotalDeposited(),
      ]);
      setBalance(b);
      setLimit(l);
      setTotalDeposited(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    clearCache();
    await refetchStats();
  }, [refetchStats]);

  useEffect(() => {
    void refetchStats();
  }, [refetchStats]);

  return {
    balance,
    limit,
    totalDeposited,
    loading,
    error,
    refetchStats,
    refresh,
  };
}
