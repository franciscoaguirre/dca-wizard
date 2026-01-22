import { useConnectionStatus } from './useConnectionStatus';
import type { ConnectionState } from '../../api/clients/connection-status';

export function ConnectionStatusIndicator() {
  const status = useConnectionStatus();

  const getStatusColor = (state: ConnectionState): string => {
    switch (state) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      case 'disconnected':
      default:
        return 'bg-neutral-400';
    }
  };

  const getStatusText = (state: ConnectionState): string => {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting';
      case 'error':
        return 'Error';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  const getChainLabel = (chain: 'assetHub' | 'hydration'): string => {
    return chain === 'assetHub' ? 'Asset Hub' : 'Hydration';
  };

  return (
    <div className="relative group">
      {/* Badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-neutral-200 shadow-sm hover:shadow-md transition-shadow cursor-default">
        <div
          className={`w-2 h-2 rounded-full ${getStatusColor(status.overallState)}`}
          aria-label={`Overall status: ${getStatusText(status.overallState)}`}
        />
        <span className="text-xs font-medium text-neutral-700">
          {status.connectedCount}/{status.totalCount} chains
        </span>
      </div>

      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-neutral-900 mb-3">
            Chain Connection Status
          </div>

          {/* Asset Hub Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(status.assetHub.state)}`}
              />
              <span className="text-xs font-medium text-neutral-700">
                {getChainLabel(status.assetHub.chain)}
              </span>
            </div>
            <span className="text-xs text-neutral-600">
              {getStatusText(status.assetHub.state)}
            </span>
          </div>

          {status.assetHub.error && (
            <div className="text-xs text-red-600 ml-4 mt-1 break-words">
              {status.assetHub.error}
            </div>
          )}

          {/* Hydration Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor(status.hydration.state)}`}
              />
              <span className="text-xs font-medium text-neutral-700">
                {getChainLabel(status.hydration.chain)}
              </span>
            </div>
            <span className="text-xs text-neutral-600">
              {getStatusText(status.hydration.state)}
            </span>
          </div>

          {status.hydration.error && (
            <div className="text-xs text-red-600 ml-4 mt-1 break-words">
              {status.hydration.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
