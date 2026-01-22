/**
 * Call Encoder Utilities
 * Helpers for encoding and displaying transaction calls
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
 * Get transaction breakdown for display
 */
export function getTransactionBreakdown(proposal: DcaProposal): {
  calls: Array<{
    name: string;
    description: string;
    pallet: string;
    call: string;
  }>;
  totalCalls: number;
} {
  const calls: Array<{
    name: string;
    description: string;
    pallet: string;
    call: string;
  }> = [];

  // 1. Treasury Spend
  calls.push({
    name: 'Treasury Spend',
    pallet: 'Utility',
    call: 'dispatch_as',
    description: `Send ${Number(proposal.inputs.dotAmount) / 1e10} DOT from treasury to Hydration`,
  });

  // 2. DCA Schedule(s)
  const dcaCount = proposal.inputs.stablecoin === 'BOTH' ? 2 : 1;
  for (let i = 0; i < dcaCount; i++) {
    const stablecoin =
      proposal.inputs.stablecoin === 'BOTH'
        ? i === 0
          ? 'USDT'
          : 'USDC'
        : proposal.inputs.stablecoin;
    calls.push({
      name: `DCA Setup (${stablecoin})`,
      pallet: 'Scheduler',
      call: 'schedule_after',
      description: `Schedule DCA to convert DOT to ${stablecoin} on Hydration`,
    });
  }

  // 3. Periodic Return
  calls.push({
    name: 'Periodic Returns',
    pallet: 'Scheduler',
    call: 'schedule_after',
    description: `Schedule ${proposal.inputs.numberOfReturns} periodic returns with 70/30 split`,
  });

  return {
    calls,
    totalCalls: calls.length,
  };
}

/**
 * Instructions for generating chain descriptors
 */
export const DESCRIPTOR_INSTRUCTIONS = `
Chain descriptors have been generated! ✓

Generated descriptors:
- Asset Hub (dotAh): .papi/descriptors/dist/dotAh.d.ts
- Hydration: .papi/descriptors/dist/hydration.d.ts

Current status:
✓ Descriptors generated
✓ DCA.schedule call encoding implemented
⚠ XCM message encoding in progress

To complete the implementation:

1. The XCM V4 messages need to be properly encoded using the PolkadotXcm pallet
2. The Scheduler calls need to wrap the XCM messages
3. The Utility.batch_all needs to combine all calls

The core infrastructure is in place. The remaining work involves:
- Converting XCM type definitions to descriptor-compatible format
- Proper encoding of nested XCM instructions
- Integration with PolkadotXcm.send() calls

For reference, see:
- src/governance/xcm-messages.ts - XCM message builders
- src/governance/builder.ts - encodeBatchCall() function
- src/governance/dca-setup.ts - encodeDcaScheduleCall() function
`.trim();

/**
 * Encode the complete proposal call
 * Uses the generated chain descriptors
 */
export async function encodeProposalCall(proposal: DcaProposal): Promise<{
  encoded: string | null;
  error: string | null;
}> {
  try {
    const { encodeBatchCall } = await import('./builder');
    const encoded = await encodeBatchCall(proposal);
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
