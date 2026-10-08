import {
  toPasskeyTransport,
  toModularTransport,
  toWebAuthnCredential,
  toCircleSmartAccount,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'
import {
  createBundlerClient,
  toWebAuthnAccount,
  type P256Credential,
} from 'viem/account-abstraction'
import { arcTestnet } from 'viem/chains'
import { createPublicClient as createViemPublicClient } from 'viem'

const rawKey = (import.meta.env.VITE_CLIENT_KEY as string | undefined)?.trim()
const clientKey = rawKey
  ? (rawKey.startsWith('TEST_CLIENT_KEY:') ? rawKey : `TEST_CLIENT_KEY:${rawKey}`)
  : ''
const clientUrl = import.meta.env.VITE_CLIENT_URL as string

export const passkeyTransport = clientUrl && clientKey
  ? toPasskeyTransport(clientUrl, clientKey)
  : null

export const modularTransport = clientUrl && clientKey
  ? toModularTransport(`${clientUrl}/arcTestnet`, clientKey)
  : null

export const publicClient = modularTransport
  ? createViemPublicClient({ chain: arcTestnet, transport: modularTransport })
  : null

export const bundlerClient = modularTransport
  ? createBundlerClient({ chain: arcTestnet, transport: modularTransport })
  : null

export async function registerPasskey(username: string): Promise<P256Credential> {
  if (!passkeyTransport) throw new Error('Circle SDK not configured')
  return toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Register, username })
}

export async function loginPasskey(): Promise<P256Credential> {
  if (!passkeyTransport) throw new Error('Circle SDK not configured')
  return toWebAuthnCredential({ transport: passkeyTransport, mode: WebAuthnMode.Login })
}

export async function getSmartAccount(credential: P256Credential) {
  if (!publicClient) throw new Error('Circle SDK not configured')
  return toCircleSmartAccount({
    client: publicClient,
    owner: toWebAuthnAccount({ credential }),
  })
}
