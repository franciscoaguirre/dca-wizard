import { useEffect, useRef, useState } from 'react';
import { useConnectionStatus } from './useConnectionStatus';
import type { ConnectionState } from '../../api/clients/connection-status';
import {
  getProviderMode,
  providerMode$,
  setProviderMode,
  type ProviderMode,
} from '../../api/clients/provider-mode';

export function ConnectionStatusIndicator() {
  const status = useConnectionStatus();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProviderMode>(getProviderMode());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sub = providerMode$.subscribe(setMode);
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const getStatusColor = (state: ConnectionState): string => {
    switch (state) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500 animate-pulse';
      case 'error': return 'bg-red-500';
      case 'disconnected':
      default: return 'bg-neutral-400';
    }
  };

  const getStatusText = (state: ConnectionState): string => {
    switch (state) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting';
      case 'error': return 'Error';
      case 'disconnected':
      default: return 'Disconnected';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-neutral-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        aria-expanded={open}
      >
        <div
          className={`w-2 h-2 rounded-full ${getStatusColor(status.overallState)}`}
          aria-label={`Overall status: ${getStatusText(status.overallState)}`}
        />
        <span className="text-xs font-medium text-neutral-700">
          {status.connectedCount}/{status.totalCount} chains
        </span>
        <span className="text-[10px] uppercase tracking-wide font-semibold text-neutral-400">
          {mode === 'ws' ? 'RPC' : 'Light'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-neutral-200 rounded-lg shadow-lg p-4 z-50">
          <div className="text-xs font-semibold text-neutral-900 mb-3">Provider</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ProviderOption
              label="Light client"
              hint="Smoldot, in-browser"
              active={mode === 'smoldot'}
              onClick={() => setProviderMode('smoldot')}
            />
            <ProviderOption
              label="WebSocket RPC"
              hint="Public endpoints"
              active={mode === 'ws'}
              onClick={() => setProviderMode('ws')}
            />
          </div>

          <div className="text-xs font-semibold text-neutral-900 mb-2">Chains</div>
          <div className="space-y-2">
            <ChainRow label="Asset Hub" status={status.assetHub} colorFor={getStatusColor} textFor={getStatusText} />
            <ChainRow label="Hydration" status={status.hydration} colorFor={getStatusColor} textFor={getStatusText} />
            <ChainRow label="Collectives" status={status.collectives} colorFor={getStatusColor} textFor={getStatusText} />
          </div>
        </div>
      )}
    </div>
  );
}

interface ProviderOptionProps {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}

function ProviderOption({ label, hint, active, onClick }: ProviderOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border p-2 transition-colors cursor-pointer ${
        active
          ? 'border-primary-600 bg-primary-50'
          : 'border-neutral-200 bg-white hover:border-neutral-300'
      }`}
    >
      <p className={`text-xs font-semibold ${active ? 'text-primary-700' : 'text-neutral-800'}`}>
        {label}
      </p>
      <p className="text-[10px] text-neutral-500 mt-0.5">{hint}</p>
    </button>
  );
}

interface ChainRowProps {
  label: string;
  status: { state: ConnectionState; error?: string };
  colorFor: (s: ConnectionState) => string;
  textFor: (s: ConnectionState) => string;
}

function ChainRow({ label, status, colorFor, textFor }: ChainRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colorFor(status.state)}`} />
          <span className="text-xs font-medium text-neutral-700">{label}</span>
        </div>
        <span className="text-xs text-neutral-600">{textFor(status.state)}</span>
      </div>
      {status.error && (
        <div className="text-xs text-red-600 ml-4 mt-1 break-words">{status.error}</div>
      )}
    </div>
  );
}
