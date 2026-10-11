import { useState, useEffect } from 'react'
import type { P256Credential } from 'viem/account-abstraction'
import { registerPasskey, loginPasskey, getSmartAccount } from '../lib/circle'

import { toast } from 'sonner'

export type AuthState = {
  credential: P256Credential | null
  address: string | null
  isConnected: boolean
  isLoading: boolean
  error: string | null
  signIn: () => Promise<void>
  signUp: () => Promise<void>
  signOut: () => void
}

const STORAGE_KEY = 'ans_passkey_credential'

export function usePasskeyAuth(): AuthState {
  const [credential, setCredential] = useState<P256Credential | null>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      return stored ? (JSON.parse(stored) as P256Credential) : null
    } catch {
      return null
    }
  })
  const [address, setAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore session on load
  useEffect(() => {
    if (credential) {
      getSmartAccount(credential)
        .then(acc => setAddress(acc.address))
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY)
          setCredential(null)
          setAddress(null)
        })
    }
  }, [credential])

  const signIn = async () => {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      let cred: P256Credential
      try {
        cred = await loginPasskey()
      } catch (loginErr: any) {
        // Stop if the user cancelled the native WebAuthn dialog
        if (loginErr?.name === 'NotAllowedError' || loginErr?.message?.toLowerCase().includes('cancel') || loginErr?.message?.toLowerCase().includes('aborted')) {
          throw new Error('Sign in was cancelled.')
        }
        console.warn('Passkey login did not complete, attempting registration...', loginErr)
        try {
          cred = await registerPasskey('ans-user-' + Date.now())
        } catch (regErr: any) {
          if (regErr?.name === 'NotAllowedError' || regErr?.message?.toLowerCase().includes('cancel') || regErr?.message?.toLowerCase().includes('aborted')) {
            throw new Error('Registration was cancelled.')
          }
          throw regErr
        }
      }
      const account = await getSmartAccount(cred)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
      setCredential(cred)
      setAddress(account.address)
      toast.success('Connected with Passkey!')
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : 'Sign in failed'
      if (e instanceof DOMException && e.name === 'SecurityError') {
        msg = 'WebAuthn domain mismatch: this key is registered for il3eocims6w6igedeo90s.preview.studio.arc.io'
      }
      setError(msg)
      console.error('Sign in error:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const signUp = async () => {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const cred = await registerPasskey('ans-user-' + Date.now())
      const account = await getSmartAccount(cred)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cred))
      setCredential(cred)
      setAddress(account.address)
      toast.success('New wallet created with Passkey!')
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : 'Sign up failed'
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        msg = 'Registration was cancelled.'
      }
      setError(msg)
      console.error('Sign up error:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY)
    setCredential(null)
    setAddress(null)
    toast.info('Signed out')
  }

  return {
    credential,
    address,
    isConnected: !!address,
    isLoading,
    error,
    signIn,
    signUp,
    signOut,
  }
}
