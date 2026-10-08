# ANS — Arc Name Service

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

A decentralized name service for the Arc blockchain. Users register `.arc` names (3/6/9/12 months), send USDC tips by name, gift names to others, and buy/sell names through an atomic-escrow marketplace. Reputation scores track each user's history. Max 3 active names per wallet.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| `ANSReputation` | `0x8a80287eb12d7bc38e52ed2ef59b0fb3de49f8ad` | [View](https://explorer.testnet.arc.io/address/0x8a80287eb12d7bc38e52ed2ef59b0fb3de49f8ad) |
| `ArcNameService` | `0xa70e51df2472677219de4afa5124a47526e27033` | [View](https://explorer.testnet.arc.io/address/0xa70e51df2472677219de4afa5124a47526e27033) |

**Owner:** `0x315EED96725dFbdDeFcdF35673634CD1eCEB9433`
**USDC:** `0x3600000000000000000000000000000000000000` (Arc Testnet)

### IMPORTANT: Post-deploy wiring required
After deploying, call `ANSReputation.setAnsContract(0xa70e51df2472677219de4afa5124a47526e27033)` from the owner wallet `0x315EED96725dFbdDeFcdF35673634CD1eCEB9433` to authorize ArcNameService to write reputation scores. This is a one-time call. Without it, register/gift/buy/tip will revert.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
