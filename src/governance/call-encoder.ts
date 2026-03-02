/**
 * Call Encoder Utilities
 * Helpers for encoding and displaying the single batched proposal
 */

import type { DcaProposal } from './builder';

/**
 * Format call data for display
 */
export function formatCallData(data: Uint8Array): string {
  return `0x${Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Calculate call size in bytes
 */
export function getCallSize(data: Uint8Array): number {
  return data.length;
}

/**
 * Check if call needs preimage
 * Calls larger than 10KB should be stored as preimage
 */
export function needsPreimage(data: Uint8Array): boolean {
  return data.length > 10 * 1024;
}

/**
 * Generate call hash (blake2_256)
 */
export async function generateCallHash(data: Uint8Array): Promise<string> {
  const { blake2b } = await import('@noble/hashes/blake2.js');
  const hash = blake2b(data, { dkLen: 32 });
  return formatCallData(hash);
}

/**
 * Get transaction breakdown for the single batched proposal
 */
export function getTransactionBreakdown(
  proposal: DcaProposal
): {
  calls: Array<{
    name: string;
    description: string;
    pallet: string;
    call: string;
    timing: string;
  }>;
  totalCalls: number;
} {
  const dotAmountDisplay = Number(proposal.inputs.dotAmount) / 1e10;
  const stablecoin = proposal.inputs.stablecoin;
  const { inputs } = proposal;

  const calls = [
    {
      name: 'Transfer DOT',
      pallet: 'PolkadotXcm',
      call: 'send → Asset Hub',
      description: `Send ${dotAmountDisplay} DOT from Fellowship Treasury to Hydration (Plurality sovereign)`,
      timing: 'Immediate',
    },
    {
      name: `Start DCA (${stablecoin})`,
      pallet: 'Scheduler → PolkadotXcm',
      call: 'schedule_after → send → Hydration',
      description: `Start DCA trading DOT → ${stablecoin} on Hydration after warmup (~${Math.round((100 * 6) / 60)} min)`,
      timing: `After 100 blocks`,
    },
    {
      name: 'Periodic Returns',
      pallet: 'Scheduler → PolkadotXcm',
      call: 'schedule_after(periodic) → send → Hydration',
      description: `Return ${stablecoin} to Fellowship Treasury (${inputs.treasurySplitPercent}%) / Salary (${inputs.salarySplitPercent}%) every ${inputs.returnFrequencyDays} days, ${inputs.numberOfReturns} times`,
      timing: `Every ${inputs.returnFrequencyDays} days`,
    },
  ];

  return {
    calls,
    totalCalls: calls.length,
  };
}

/**
 * Encode the single batched proposal
 */
export async function encodeProposal(
  proposal: DcaProposal,
  dotPriceInUsd: number
): Promise<{
  encoded: string | null;
  error: string | null;
}> {
  try {
    const { encodeBatchCall } = await import('./builder');
    const encoded = await encodeBatchCall(proposal, dotPriceInUsd);
    return {
      encoded,
      error: null,
    };
  } catch (error) {
    console.error('Encoding error:', error);
    return {
      encoded: null,
      error: error instanceof Error ? error.message + '\n\nStack: ' + error.stack : 'Failed to encode proposal call',
    };
  }
}
