# DCA Wizard

A React application for creating governance proposals for Dollar Cost Averaging (DCA) treasury operations on Polkadot.

## Overview

The DCA Wizard generates a referendum proposal that:
1. Sends DOT from Polkadot treasury (Asset Hub) to Hydration
2. Schedules a DCA to convert DOT to stablecoins on Hydration
3. Periodically returns stables to Asset Hub with automatic 70/30 split to Fellowship treasury and salary accounts

## Features

- **Multi-step Wizard**: Intuitive form → preview → submit flow
- **Network Support**: Both Polkadot mainnet and Paseo testnet
- **Configurable Parameters**:
  - DOT amount allocation
  - Stablecoin selection (USDT, USDC, or both)
  - DCA frequency and duration
  - Slippage tolerance
  - Return schedule and split ratios
- **Real-time Validation**: Form validation with instant feedback
- **Proposal Preview**: Detailed review of the complete strategy before submission
- **Automatic Calculations**: Estimates trades, output, and fees

## Tech Stack

- **React 19** + **Vite** + **TypeScript**
- **polkadot-api** for blockchain interactions
- **Tailwind CSS** for styling
- **@scure/base** and **@noble/hashes** for address encoding

## Project Structure

```
src/
├── api/
│   ├── constants.ts         # Chain IDs, accounts, assets, timing
│   ├── chains.ts            # Chain configurations
│   └── clients/             # Chain client setup
│       ├── dotAh.ts         # Asset Hub client
│       └── hydration.ts     # Hydration client
├── governance/
│   ├── builder.ts           # Main proposal builder
│   ├── xcm-messages.ts      # XCM V4 construction
│   ├── dca-setup.ts         # DCA scheduling logic
│   └── periodic-return.ts   # Return with split logic
├── DcaWizard/
│   ├── DcaWizard.tsx        # Container component
│   ├── DcaWizardForm.tsx    # Configuration form
│   ├── ProposalPreview.tsx  # Review component
│   ├── SubmitProposal.tsx   # Submission flow
│   └── use-wizard-state.ts  # State management hook
├── components/ui/           # Reusable UI components
└── lib/                     # Utilities
```

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

## Configuration

### Network Constants

All network-specific constants are defined in `src/api/constants.ts`:

- **Parachain IDs**: Asset Hub (1000), Hydration (2034), Collectives (1001)
- **Asset IDs**: Different IDs for DOT, USDT, USDC on each chain
- **Account Addresses**: Treasury, Fellowship Treasury, Fellowship Salary
- **Timing**: Block time (6s), blocks per day (14,400)

### Default Values

Default DCA parameters in `src/api/constants.ts`:

- DCA Frequency: 100 blocks (~10 minutes)
- DCA Duration: 30 days
- Slippage: 1%
- Return Frequency: 1 day
- Number of Returns: 30
- Treasury Split: 70% / 30%

## Implementation Status

### ✅ Completed

- Core constants and network configuration
- Chain client setup for Asset Hub and Hydration
- XCM V4 message builders for all operations
- DCA setup transaction logic
- Periodic return with automatic split logic
- Complete proposal builder
- Form state management with useReducer
- All UI components (Form, Preview, Submit)
- Real-time validation and calculations
- Responsive design with Tailwind CSS

### 🚧 To Be Implemented

1. **Chain Descriptors**: Generate with `papi` CLI
   ```bash
   papi add dot -n polkadot
   papi add dot-asset-hub -n asset-hub
   papi add hydration -n hydration
   ```

2. **Wallet Integration**: ReactiveDot or polkadot-api wallet connection
   - Connect to Talisman/Subwallet/PolkadotJS
   - Account selection
   - Transaction signing

3. **Actual Call Encoding**:
   - `encodeDcaScheduleCall` needs Hydration chain API
   - `encodeBatchCall` needs Asset Hub chain API
   - Preimage creation for large calls

4. **Submission Logic**:
   - Build and sign Referenda.submit transaction
   - Monitor for finalization
   - Extract referendum ID from events

5. **Price Feed Integration**:
   - Fetch real-time DOT price from Hydration oracle or API
   - Update estimates dynamically

6. **Testing**:
   - Unit tests for calculation functions
   - Integration tests with Chopsticks
   - Testnet deployment (Paseo)

## Transaction Flow

### High-Level Flow

```
Governance Proposal (Referendum)
└─> Utility.batch_all [
      1. Treasury Spend: DOT → Hydration
      2. Schedule DCA: DOT → Stables (USDT/USDC)
      3. Schedule Periodic Returns: Stables → Asset Hub (split 70/30)
    ]
```

### Detailed Operations

1. **Treasury Spend** (`Utility.dispatch_as` with treasury origin)
   - XCM: `WithdrawAsset` + `PayFees` + `DepositReserveAsset`
   - Sends DOT to Collectives sovereign account on Hydration

2. **DCA Setup** (`Scheduler.schedule_after` - one-time, after 100 blocks)
   - XCM: `WithdrawAsset` + `BuyExecution` + `AliasOrigin` + `Transact`
   - Executes `DCA.schedule` on Hydration

3. **Periodic Returns** (`Scheduler.schedule_after` with `maybe_periodic`)
   - XCM: `WithdrawAsset` + `AliasOrigin` + `InitiateReserveWithdraw`
   - Two `DepositAsset` instructions for 70/30 split

## Key Features

### Automatic Split

The periodic return XCM uses two `DepositAsset` instructions:
1. First deposits 70% to Fellowship Treasury
2. Second deposits remaining 30% to Fellowship Salary

This ensures automatic splitting without manual intervention.

### Sovereign Account Derivation

The Collectives parachain's sovereign account on Hydration is calculated as:
```
blake2_256("para" + encode(1001))
```

This account is used as the owner for DCA operations.

### Fee Management

- Initial transfer: ~0.1 DOT
- DCA setup: ~0.05 DOT per schedule
- Periodic returns: ~0.1 DOT per return
- 10% buffer added for safety

## Development Notes

### XCM Compatibility

- Asset Hub supports XCM V5
- Hydration may only support XCM V4
- Solution: Use V4 messages, wrap in V5 where needed

### Address Encoding

Uses the same approach as polkadot-api:
- `@scure/base` for base58 encoding/decoding
- `@noble/hashes/blake2` for checksums
- Full SS58 address validation

### State Management

The wizard uses `useReducer` for complex form state:
- Input values and validation
- Touched fields tracking
- Real-time proposal building (debounced 500ms)
- Multi-step navigation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (especially XCM logic!)
5. Submit a pull request

## Resources

- [Polkadot API Docs](https://papi.how)
- [XCM Format](https://wiki.polkadot.network/docs/learn-xcm)
- [Hydration DCA Pallet](https://docs.hydration.net/)
- [OpenGov on Polkadot](https://wiki.polkadot.network/docs/learn-polkadot-opengov)

## License

MIT

## Disclaimer

This is a prototype implementation. Always test on testnet (Paseo) before submitting mainnet proposals involving real funds.
