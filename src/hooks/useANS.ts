import { useCallback } from 'react'
import {
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type Address,
  createPublicClient,
  http,
} from 'viem'
import { arcTestnet } from 'viem/chains'
import type { P256Credential } from 'viem/account-abstraction'
import { bundlerClient, publicClient, getSmartAccount } from '../lib/circle'
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
  return name.toLowerCase().replace(/\.arc$/i, '').replace('.arc', '').trim()
}

async function checkBalance(readClient: any, accountAddress: string, requiredWei: bigint) {
  const balance = (await readClient.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [accountAddress],
  })) as bigint
  if (balance < requiredWei) {
    const required = Number(formatUnits(requiredWei, 6))
    const current = Number(formatUnits(balance, 6))
    throw new Error(`Insufficient USDC. You need ${required} USDC, but have ${current} USDC.`)
  }
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
    async (
      name: string,
      durationMonths: number,
      priceOrProgress?: string | ((step: 'approving' | 'registering' | 'done') => void),
      onProgressCb?: (step: 'approving' | 'registering' | 'done') => void
    ): Promise<string> => {
      const onProgress = typeof priceOrProgress === 'function' ? priceOrProgress : onProgressCb
      const { account, bundler } = await ensureAccount()
      const nameWithoutDotArc = cleanName(name)
      const dur = Number(durationMonths)
      const readClient = publicClient || fallbackPublicClient

      // 1. Get exact price from contract via getPrice(name, duration)
      const priceWei = (await readClient.readContract({
        address: ANS_ADDRESS,
        abi: ANS_ABI,
        functionName: 'getPrice',
        args: [nameWithoutDotArc, dur],
      })) as bigint

      // Check balance
      await checkBalance(readClient, account.address, priceWei)

      // Encode approve USDC
      const approveCalldata = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      // Encode register
      const registerCalldata = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'register',
        args: [nameWithoutDotArc, dur],
      })

      try {
        // Step 1: Send approve userOp & wait
        onProgress?.('approving')
        const approveHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: approveCalldata, value: 0n }],
          paymaster: true,
        })
        await bundler.waitForUserOperationReceipt({ hash: approveHash })

        // Step 2: ONLY after approve confirms, send register userOp & wait
        onProgress?.('registering')
        const registerHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: ANS_ADDRESS, data: registerCalldata, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({
          hash: registerHash,
        })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      } catch (err: any) {
        if (err.message?.includes('Internal error')) {
          throw new Error('Transaction reverted during simulation. The name might be taken or invalid.')
        }
        throw err
      }
    },
    [ensureAccount]
  )

  const giftName = useCallback(
    async (
      name: string,
      durationMonths: number,
      recipient: string,
      priceOrProgress?: string | ((step: 'approving' | 'registering' | 'done') => void),
      onProgressCb?: (step: 'approving' | 'registering' | 'done') => void
    ): Promise<string> => {
      const onProgress = typeof priceOrProgress === 'function' ? priceOrProgress : onProgressCb
      const { account, bundler } = await ensureAccount()
      const nameWithoutDotArc = cleanName(name)
      const dur = Number(durationMonths)
      const readClient = publicClient || fallbackPublicClient

      let recipientAddress = recipient.trim()
      if (recipientAddress.toLowerCase().endsWith('.arc')) {
        const resolved = await readClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'resolve',
          args: [cleanName(recipientAddress)],
        })
        recipientAddress = resolved as string
      }

      // Exact price from contract via getPrice(name, duration)
      const priceWei = (await readClient.readContract({
        address: ANS_ADDRESS,
        abi: ANS_ABI,
        functionName: 'getPrice',
        args: [nameWithoutDotArc, dur],
      })) as bigint

      await checkBalance(readClient, account.address, priceWei)

      const approveCalldata = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const giftCalldata = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'giftName',
        args: [nameWithoutDotArc, dur, recipientAddress as Address],
      })

      try {
        // Step 1: Send approve userOp & wait
        onProgress?.('approving')
        const approveHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: approveCalldata, value: 0n }],
          paymaster: true,
        })
        await bundler.waitForUserOperationReceipt({ hash: approveHash })

        // Step 2: ONLY after approve confirms, send giftName userOp & wait
        onProgress?.('registering')
        const giftHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: ANS_ADDRESS, data: giftCalldata, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({
          hash: giftHash,
        })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      } catch (err: any) {
        if (err.message?.includes('Internal error')) throw new Error('Transaction reverted during simulation.')
        throw err
      }
    },
    [ensureAccount]
  )

  const renew = useCallback(
    async (
      name: string,
      durationMonths: number,
      priceOrProgress?: string | ((step: 'approving' | 'renewing' | 'done') => void),
      onProgressCb?: (step: 'approving' | 'renewing' | 'done') => void
    ): Promise<string> => {
      const onProgress = typeof priceOrProgress === 'function' ? priceOrProgress : onProgressCb
      const { account, bundler } = await ensureAccount()
      const nameWithoutDotArc = cleanName(name)
      const dur = Number(durationMonths)
      const readClient = publicClient || fallbackPublicClient

      // Exact price from contract via getPrice(name, duration)
      const priceWei = (await readClient.readContract({
        address: ANS_ADDRESS,
        abi: ANS_ABI,
        functionName: 'getPrice',
        args: [nameWithoutDotArc, dur],
      })) as bigint

      await checkBalance(readClient, account.address, priceWei)

      const approveCalldata = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'approve',
        args: [ANS_ADDRESS, priceWei],
      })

      const renewCalldata = encodeFunctionData({
        abi: ANS_ABI,
        functionName: 'renew',
        args: [nameWithoutDotArc, dur],
      })

      try {
        // Step 1: Send approve userOp & wait
        onProgress?.('approving')
        const approveHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: approveCalldata, value: 0n }],
          paymaster: true,
        })
        await bundler.waitForUserOperationReceipt({ hash: approveHash })

        // Step 2: ONLY after approve confirms, send renew userOp & wait
        onProgress?.('renewing')
        const renewHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: ANS_ADDRESS, data: renewCalldata, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({
          hash: renewHash,
        })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      } catch (err: any) {
        if (err.message?.includes('Internal error')) throw new Error('Transaction reverted during simulation.')
        throw err
      }
    },
    [ensureAccount]
  )

  const transferName = useCallback(
    async (name: string, to: string): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const readClient = publicClient || fallbackPublicClient

      let toAddress = to.trim()
      if (toAddress.toLowerCase().endsWith('.arc')) {
        const resolved = await readClient.readContract({
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
        calls: [{ to: ANS_ADDRESS, data: transferData, value: 0n }],
        paymaster: true,
      })

      const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
      return txHash
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
        calls: [{ to: ANS_ADDRESS, data: listData, value: 0n }],
        paymaster: true,
      })

      const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
      return txHash
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
        calls: [{ to: ANS_ADDRESS, data: cancelData, value: 0n }],
        paymaster: true,
      })

      const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
      const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
      return txHash
    },
    [ensureAccount]
  )

  const buyName = useCallback(
    async (
      name: string,
      priceUsdc?: string,
      onProgress?: (step: 'approving' | 'buying' | 'done') => void
    ): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const clean = cleanName(name)
      const readClient = publicClient || fallbackPublicClient

      // Query exact listing price from contract
      let priceWei: bigint = 0n
      try {
        const listing = (await readClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'getListing',
          args: [clean],
        })) as { seller: string; price: bigint; active: boolean }
        priceWei = listing.price
      } catch {
        priceWei = priceUsdc ? parseUnits(priceUsdc, 6) : 0n
      }
      if (!priceWei && priceUsdc) {
        priceWei = parseUnits(priceUsdc, 6)
      }

      await checkBalance(readClient, account.address, priceWei)

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

      try {
        // Step 1: Send approve userOp & wait
        onProgress?.('approving')
        const approveHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: approveData, value: 0n }],
          paymaster: true,
        })
        await bundler.waitForUserOperationReceipt({ hash: approveHash })

        // Step 2: ONLY after approve confirms, send buyName userOp & wait
        onProgress?.('buying')
        const buyHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: ANS_ADDRESS, data: buyData, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({ hash: buyHash })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      } catch (err: any) {
        if (err.message?.includes('Internal error')) throw new Error('Transaction reverted during simulation.')
        throw err
      }
    },
    [ensureAccount]
  )

  const sendTip = useCallback(
    async (
      toRecipient: string,
      amountUsdc: string,
      note: string,
      onProgress?: (step: 'approving' | 'tipping' | 'done') => void
    ): Promise<string> => {
      const { account, bundler } = await ensureAccount()
      const amountWei = parseUnits(amountUsdc, 6)
      const trimmed = toRecipient.trim()
      const readClient = publicClient || fallbackPublicClient

      await checkBalance(readClient, account.address, amountWei)

      if (trimmed.startsWith('0x') && trimmed.length === 42) {
        onProgress?.('tipping')
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
          calls: [{ to: USDC_ADDRESS, data: transferData, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      }

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

      try {
        // Step 1: Send approve userOp & wait
        onProgress?.('approving')
        const approveHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: USDC_ADDRESS, data: approveData, value: 0n }],
          paymaster: true,
        })
        await bundler.waitForUserOperationReceipt({ hash: approveHash })

        // Step 2: ONLY after approve confirms, send sendTip userOp & wait
        onProgress?.('tipping')
        const tipHash = await bundler.sendUserOperation({
          account,
          calls: [{ to: ANS_ADDRESS, data: tipData, value: 0n }],
          paymaster: true,
        })
        const receipt = await bundler.waitForUserOperationReceipt({ hash: tipHash })
        onProgress?.('done')
        const txHash = (receipt as any).receipt?.transactionHash || receipt.userOpHash
        return txHash
      } catch (err: any) {
        if (err.message?.includes('Internal error')) throw new Error('Transaction reverted during simulation.')
        throw err
      }
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
