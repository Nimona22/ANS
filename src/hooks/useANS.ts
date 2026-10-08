import { useCallback } from 'react'
import {
  encodeFunctionData,
  parseUnits,
  type Address,
  createPublicClient,
  http,
} from 'viem'
import { arcTestnet } from 'viem/chains'
import type { P256Credential } from 'viem/account-abstraction'
import { bundlerClient, getSmartAccount } from '../lib/circle'
import {
  ANS_ABI,
  ANS_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from '../lib/abis'

export const fallbackPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.io'),
})

export function cleanName(name: string): string {
  return name.replace(/\.arc$/i, '').toLowerCase().trim()
}

export function useANS(credential: P256Credential | null) {
  const ensureAccount = useCallback(async () => {
    if (!credential) {
      throw new Error('Please sign in with your passkey first')
    }
    if (!bundlerClient) {
      throw new Error('Circle bundler client is not initialized')
    }
    const account = await getSmartAccount(credential)
    return { account, bundler: bundlerClient }
  }, [credential])

  const register = useCallback(
    async (name: string, durationMonths: number, priceUsdc: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const priceWei = parseUnits(priceUsdc, 6)

      const approveData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const registerData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'register',
        args: [clean, durationMonths],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDRESS, data: approveData },
          { to: ANS_ADDRESS, data: registerData },
        ],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const giftName = useCallback(
    async (
      name: string,
      durationMonths: number,
      recipient: string,
      priceUsdc: string
    ): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const priceWei = parseUnits(priceUsdc, 6)

      let recipientAddress = recipient.trim()
      if (recipientAddress.toLowerCase().endsWith('.arc')) {
        const resolved = await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'resolve',
          args: [cleanName(recipientAddress)],
        })
        recipientAddress = resolved as string
      }

      const approveData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const giftData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'giftName',
        args: [clean, durationMonths, recipientAddress as Address],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDRESS, data: approveData },
          { to: ANS_ADDRESS, data: giftData },
        ],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const renew = useCallback(
    async (name: string, durationMonths: number, priceUsdc: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const priceWei = parseUnits(priceUsdc, 6)

      const approveData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const renewData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'renew',
        args: [clean, durationMonths],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDRESS, data: approveData },
          { to: ANS_ADDRESS, data: renewData },
        ],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const transferName = useCallback(
    async (name: string, to: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)

      let toAddress = to.trim()
      if (toAddress.toLowerCase().endsWith('.arc')) {
        const resolved = await fallbackPublicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'resolve',
          args: [cleanName(toAddress)],
        })
        toAddress = resolved as string
      }

      const transferData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'transferName',
        args: [clean, toAddress as Address],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [{ to: ANS_ADDRESS, data: transferData }],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const listForSale = useCallback(
    async (name: string, priceUsdc: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const priceWei = parseUnits(priceUsdc, 6)

      const listData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'listForSale',
        args: [clean, priceWei],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [{ to: ANS_ADDRESS, data: listData }],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const cancelListing = useCallback(
    async (name: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)

      const cancelData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'cancelListing',
        args: [clean],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [{ to: ANS_ADDRESS, data: cancelData }],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const buyName = useCallback(
    async (name: string, priceUsdc: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const priceWei = parseUnits(priceUsdc, 6)

      const approveData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const buyData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'buyName',
        args: [clean],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDRESS, data: approveData },
          { to: ANS_ADDRESS, data: buyData },
        ],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  const sendTip = useCallback(
    async (toRecipient: string, amountUsdc: string, note: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const amountWei = parseUnits(amountUsdc, 6)
      const trimmed = toRecipient.trim()

      if (trimmed.startsWith('0x') && trimmed.length === 42) {
        // Direct USDC transfer to raw EVM address
        const transferData = encodeFunctionData({
          abi: [
            {
              type: 'function',
              name: 'transfer',
              inputs: [
                { name: 'recipient', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [{ type: 'bool' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'transfer',
          args: [trimmed as Address, amountWei],
        })

        const userOpHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: transferData }],
          paymaster: true,
        })
        const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
        return receipt.transactionHash
      }

      // Name tip on ArcNameService
      const clean = cleanName(trimmed)
      const approveData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, amountWei],
      })

      const tipData = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'sendTip',
        args: [clean, amountWei, note || ''],
      })

      const userOpHash = await bundler.sendUserOperation({
        account,
        calls: [
          { to: USDC_ADDRESS, data: approveData },
          { to: ANS_ADDRESS, data: tipData },
        ],
        paymaster: true,
      })

      const { receipt } = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      return receipt.transactionHash
    },
    [ensureAccount]
  )

  return {
    register,
    giftName,
    renew,
    transferName,
    listForSale,
    cancelListing,
    buyName,
    sendTip,
  }
}
