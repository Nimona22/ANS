/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { createPublicClient } from 'viem'
import { createBundlerClient } from 'viem/account-abstraction'
import {
  toModularTransport,
  toPasskeyTransport,
} from '@circle-fin/modular-wallets-core'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined
const clientUrl = import.meta.env.VITE_CLIENT_URL as string | undefined

// Only initialise Circle transports when both env vars are present.
// If VITE_CLIENT_KEY is missing the app renders normally — passkey sign-in
// will show an error when the user taps the button rather than crashing at load.
export const passkeyTransport = clientUrl && clientKey
  ? toPasskeyTransport(clientUrl, clientKey)
  : null

export const modularTransport = clientUrl && clientKey
  ? toModularTransport(`${clientUrl}/arcTestnet`, clientKey)
  : null

export const publicClient = modularTransport
  ? createPublicClient({ chain: arcTestnet, transport: modularTransport })
  : null

export const bundlerClient = modularTransport
  ? createBundlerClient({ chain: arcTestnet, transport: modularTransport })
  : null
