import { BehaviorSubject, combineLatest, map } from 'rxjs';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChainConnectionStatus {
  chain: 'assetHub' | 'hydration';
  state: ConnectionState;
  timestamp: number;
  error?: string;
}

export interface ConnectionStatusSummary {
  assetHub: ChainConnectionStatus;
  hydration: ChainConnectionStatus;
  connectedCount: number;
  totalCount: number;
  overallState: ConnectionState;
}

// BehaviorSubjects to track individual chain statuses
const assetHubStatus$ = new BehaviorSubject<ChainConnectionStatus>({
  chain: 'assetHub',
  state: 'disconnected',
  timestamp: Date.now(),
});

const hydrationStatus$ = new BehaviorSubject<ChainConnectionStatus>({
  chain: 'hydration',
  state: 'disconnected',
  timestamp: Date.now(),
});

// Combine statuses into a summary observable
export const connectionStatusSummary$ = combineLatest([
  assetHubStatus$,
  hydrationStatus$,
]).pipe(
  map(([assetHub, hydration]) => {
    const connectedCount = [assetHub, hydration].filter(
      (status) => status.state === 'connected'
    ).length;
    const totalCount = 2;

    // Determine overall state
    let overallState: ConnectionState = 'disconnected';

    const states = [assetHub.state, hydration.state];

    if (states.some(s => s === 'error')) {
      overallState = 'error';
    } else if (states.every(s => s === 'connected')) {
      overallState = 'connected';
    } else if (states.some(s => s === 'connecting')) {
      overallState = 'connecting';
    } else if (connectedCount > 0) {
      overallState = 'connecting'; // Partial connection shown as connecting
    }

    return {
      assetHub,
      hydration,
      connectedCount,
      totalCount,
      overallState,
    } satisfies ConnectionStatusSummary;
  })
);

// Function to update connection status for a specific chain
export function updateConnectionStatus(
  chain: 'assetHub' | 'hydration',
  state: ConnectionState,
  error?: string
): void {
  const status: ChainConnectionStatus = {
    chain,
    state,
    timestamp: Date.now(),
    error,
  };

  if (chain === 'assetHub') {
    assetHubStatus$.next(status);
  } else {
    hydrationStatus$.next(status);
  }
}
