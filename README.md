# PhantomPad

PhantomPad is a privacy-first crowdfunding dApp that lets teams raise cUSDC while keeping pledge amounts encrypted end to end.
It uses Zama FHEVM to compute totals and balances without revealing individual contributions on-chain.

## Project Overview

PhantomPad enables creators to set a campaign name, target, and deadline, then accept encrypted cUSDC from contributors.
Each pledge is recorded as encrypted data, totals are aggregated with fully homomorphic encryption, and creators can end a
campaign at any time to receive the encrypted payout. Contributors keep their amounts private while still interacting with
verifiable smart contracts.

## Problem Statement

Traditional crowdfunding on public chains exposes:
- Pledge sizes and donor behavior to everyone.
- Competitive intelligence about a campaign's real momentum.
- Sensitive funding data that may deter contributors.

At the same time, users still need:
- Transparent campaign status.
- On-chain settlement and payouts.
- A reliable, auditable flow that does not depend on a centralized operator.

## Solution

PhantomPad combines encrypted token transfers (ERC7984 cUSDC) with FHEVM computations so that:
- Contribution amounts are encrypted at the source.
- Totals and per-user contributions are stored as ciphertext.
- Decryption only happens client-side for authorized viewers.
- Campaign settlement is handled on-chain without exposing amounts.

## Key Advantages

- Confidential funding: amounts remain encrypted on-chain.
- Public transparency: campaign metadata and events are still visible.
- Fair settlement: payout logic is enforced by smart contracts.
- Simple UX: contributors interact with a familiar wallet flow.
- Verifiable privacy: amounts are computed with FHE, not off-chain trust.

## Feature Set

Smart contract capabilities:
- Create campaigns with name, target, deadline, and creator.
- Accept encrypted cUSDC contributions via `confidentialTransferAndCall`.
- Track total raised and per-user contributions as encrypted values.
- Allow creators to end campaigns and receive encrypted payouts.
- Query campaign status and encrypted treasury balance.

Frontend capabilities:
- Wallet connect with RainbowKit on Sepolia.
- Create campaigns from the UI.
- Mint test cUSDC (for demo flows).
- Contribute with encrypted cUSDC.
- Decrypt totals, targets, contributions, and balances through the Zama relayer.
- Live status indicators for campaigns and relayer readiness.

## How It Works

1. Creator deploys contracts and launches a campaign with a target and deadline.
2. Contributors mint test cUSDC and encrypt their pledge locally.
3. The token calls `confidentialTransferAndCall`, sending encrypted data to `PhantomPad`.
4. `PhantomPad` aggregates encrypted totals and stores per-user contribution handles.
5. Users can request decryption through the relayer to view totals or their own amounts.
6. The creator ends the campaign and receives encrypted cUSDC payout.

## Architecture

On-chain:
- `ConfidentialUSDC`: ERC7984 confidential token for encrypted transfers.
- `PhantomPad`: crowdfunding logic and encrypted accounting.

Off-chain:
- Zama relayer SDK: handles encryption, proofs, and user decryption flows.
- Frontend UI: React + Vite for wallet connection and transaction UX.

## Technology Stack

Smart contracts:
- Solidity 0.8.27
- Zama FHEVM libraries (`@fhevm/solidity`)
- OpenZeppelin confidential contracts (`@openzeppelin/confidential-contracts`)

Tooling:
- Hardhat + hardhat-deploy
- TypeChain (ethers v6 target)
- Mocha/Chai for tests

Frontend:
- React + Vite
- RainbowKit + Wagmi for wallet connection
- Viem for reads and Ethers for writes
- Zama relayer SDK for encryption and decryption

## Repository Layout

```
contracts/            Smart contracts
deploy/               Deployment scripts
tasks/                Hardhat CLI tasks
test/                 Contract tests
frontend/             React application
hardhat.config.ts     Hardhat configuration
```

## Prerequisites

- Node.js 20+
- npm 7+
- A Sepolia RPC key for Infura
- A funded Sepolia account for deployment

## Installation

From the repo root:

```bash
npm install
```

For the frontend:

```bash
cd frontend
npm install
```

## Environment Configuration

Create a `.env` in the repo root with:

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=0x_your_private_key
ETHERSCAN_API_KEY=optional_key_for_verification
```

Notes:
- Use a private key, not a mnemonic.
- The frontend does not use environment variables.

## Compile and Test

```bash
npm run compile
npm run test
```

Run the Sepolia test suite:

```bash
npm run test:sepolia
```

## Local Development (Contracts Only)

```bash
npm run chain
npm run deploy:localhost
```

Use the local network for contract testing only. The frontend is configured for Sepolia.

## Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Optional verification:

```bash
npm run verify:sepolia -- <CONTRACT_ADDRESS>
```

After deployment, Hardhat Deploy writes artifacts and ABIs into `deployments/sepolia`.

## Frontend Setup

1. Copy contract addresses into `frontend/src/config/contracts.ts`.
2. Replace the placeholder ABI arrays in `frontend/src/config/contracts.ts` with the generated ABIs from `deployments/sepolia`.
3. Set the WalletConnect `projectId` in `frontend/src/config/wagmi.ts`.

Run the app:

```bash
cd frontend
npm run dev
```

## Hardhat Tasks

Available tasks in `tasks/phantompad.ts`:

```bash
npx hardhat task:phantompad:addresses
npx hardhat task:phantompad:mint --to <address> --amount <uint64>
npx hardhat task:phantompad:create --name "My Campaign" --target <uint64> --deadline <timestamp>
npx hardhat task:phantompad:contribute --campaign <id> --amount <uint64>
npx hardhat task:phantompad:decrypt-total --campaign <id>
```

## Smart Contract Notes

`ConfidentialUSDC`:
- Implements ERC7984 for confidential transfers.
- `mint` is public for demo/testing, not production-ready.
- All amounts are encrypted `euint64`.

`PhantomPad`:
- Stores target and totals as `euint64`.
- Enforces deadlines for contributions.
- Allows creators to end campaigns at any time.
- Resets `totalRaised` to zero after payout.
- Does not compare totals to targets on-chain (target remains encrypted).

## Privacy and Security Considerations

- Amounts are encrypted, but addresses and timestamps are public.
- Events emit ciphertext, not plaintext amounts.
- The relayer is required for encryption and decryption flows.
- `uint64` limits apply to target and contribution sizes.
- The `mint` function is intentionally open for testing and should be restricted in production.
- No automated refunds or goal enforcement are implemented yet.

## Future Roadmap

Planned improvements:
- Goal-based campaign logic and optional refunds.
- Creator metadata, media, and off-chain campaign descriptions.
- Multi-token support beyond cUSDC.
- Permissioned minting or bridging for real assets.
- Campaign analytics with privacy-preserving aggregates.
- Role-based access control and optional pausing.
- Better UX around relayer availability and error recovery.
- Expanded test coverage for edge cases and relayer failures.

## License

BSD-3-Clause-Clear. See `LICENSE`.
