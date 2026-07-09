/**
 * Call Encoder Utilities
 * Helpers for encoding and displaying the batched proposal.
 * Batch contents vary by ProposalMode (setup / return / both).
 */

import type { DcaProposal } from './builder';

/**
 * Get transaction breakdown for the batched proposal.
 * Returns only the calls that are actually included for the current mode.
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
  const { inputs } = proposal;
  const mode = inputs.mode;
  const dotAmountDisplay = Number(inputs.dotAmount ?? 0n) / 1e10;

  const calls: Array<{
    name: string;
    description: string;
    pallet: string;
    call: string;
    timing: string;
  }> = [];

  const isTreasury = (inputs.origin ?? 'fellowship') === 'treasury';

  if (isTreasury && mode !== 'return') {
    calls.push({
      name: 'Treasury spend',
      pallet: 'Utility → Balances',
      call: 'dispatch_as(Treasury) → transfer_keep_alive',
      description: `Transfer ${dotAmountDisplay.toLocaleString()} DOT from the main Treasury to the Fellowship Treasury account on Asset Hub`,
      timing: 'Immediate',
    });
  }

  if (mode !== 'return') {
    calls.push({
      name: 'Setup DCA',
      pallet: isTreasury ? 'Utility → PolkadotXcm' : 'PolkadotXcm',
      call: isTreasury ? 'dispatch_as(FT) → execute' : 'send → Asset Hub',
      description: `Single V5 XCM: transfer ${dotAmountDisplay} DOT from Fellowship Treasury to its Hydration sovereign and start the DCA schedule (DOT → HOLLAR) in one inbound message`,
      timing: 'Immediate',
    });
  }

  if (mode !== 'setup') {
    calls.push({
      name: 'Periodic Returns',
      pallet: isTreasury ? 'Scheduler → Utility → PolkadotXcm' : 'Scheduler → PolkadotXcm',
      call: isTreasury
        ? 'schedule_after(periodic) → dispatch_as(FT) → execute'
        : 'schedule_after(periodic) → send → Asset Hub',
      description: `XCM (AH → Hydration → AH) returning HOLLAR to Fellowship Treasury (${inputs.treasurySplitPercent ?? 0}%) / Salary (${inputs.salarySplitPercent ?? 0}%) every ${inputs.returnFrequencyDays ?? 0} days, ${inputs.numberOfReturns ?? 0} times`,
      timing: `Every ${inputs.returnFrequencyDays ?? 0} days`,
    });
  }

  return {
    calls,
    totalCalls: calls.length,
  };
}

/**
 * Encode the batched proposal
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
