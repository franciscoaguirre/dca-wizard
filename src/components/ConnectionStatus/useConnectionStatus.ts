import { useState, useEffect } from 'react';
import { connectionStatusSummary$, type ConnectionStatusSummary } from '../../api/clients/connection-status';

export function useConnectionStatus(): ConnectionStatusSummary {
  const [status, setStatus] = useState<ConnectionStatusSummary>(() => ({
    assetHub: { chain: 'assetHub', state: 'disconnected', timestamp: Date.now() },
    hydration: { chain: 'hydration', state: 'disconnected', timestamp: Date.now() },
    collectives: { chain: 'collectives', state: 'disconnected', timestamp: Date.now() },
    connectedCount: 0,
    totalCount: 3,
    overallState: 'disconnected',
  }));

  useEffect(() => {
    const subscription = connectionStatusSummary$.subscribe(setStatus);
    return () => subscription.unsubscribe();
  }, []);

  return status;
}
