/**
 * Collapsible on-chain snapshot: Treasury/Salary balances plus active DCA status.
 * Collapsed by default so the Configure flow leads with the proposal, not the data.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { TreasurySnapshot } from './TreasurySnapshot';
import { DcaStatus } from './DcaStatus';

export function InfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-6 text-left cursor-pointer"
      >
        <span className="text-base font-semibold text-primary">On-chain snapshot</span>
        <ChevronDown
          className={`h-5 w-5 text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <CardContent className="pt-0 space-y-6">
          <TreasurySnapshot bare />
          <DcaStatus bare />
        </CardContent>
      )}
    </Card>
  );
}
