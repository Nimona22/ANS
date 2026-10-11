export const ANS_ADDRESS = '0xa70e51df2472677219de4afa5124a47526e27033' as const
export const REPUTATION_ADDRESS = '0x8a80287eb12d7bc38e52ed2ef59b0fb3de49f8ad' as const
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const ARC_TESTNET_CHAIN_ID = 5042002

export const ANS_ABI = [
  { type: 'function', name: 'isAvailable', inputs: [{ name: 'name', type: 'string' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getNameRecord', inputs: [{ name: 'name', type: 'string' }], outputs: [{ components: [{ name: 'owner', type: 'address' }, { name: 'expiry', type: 'uint64' }, { name: 'listed', type: 'bool' }], type: 'tuple' }], stateMutability: 'view' },
  { type: 'function', name: 'getPrice', inputs: [{ name: 'name', type: 'string' }, { name: 'durationMonths', type: 'uint8' }], outputs: [{ type: 'uint256' }], stateMutability: 'pure' },
  { type: 'function', name: 'getListing', inputs: [{ name: 'name', type: 'string' }], outputs: [{ components: [{ name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'active', type: 'bool' }], type: 'tuple' }], stateMutability: 'view' },
  { type: 'function', name: 'getNamesByOwner', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'string[]' }], stateMutability: 'view' },
  { type: 'function', name: 'resolve', inputs: [{ name: 'name', type: 'string' }], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'reverseLookup', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'avatars', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'setAvatar', inputs: [{ name: 'url', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'register', inputs: [{ name: 'name', type: 'string' }, { name: 'durationMonths', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'giftName', inputs: [{ name: 'name', type: 'string' }, { name: 'durationMonths', type: 'uint8' }, { name: 'recipient', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'renew', inputs: [{ name: 'name', type: 'string' }, { name: 'durationMonths', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferName', inputs: [{ name: 'name', type: 'string' }, { name: 'to', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'listForSale', inputs: [{ name: 'name', type: 'string' }, { name: 'price', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelListing', inputs: [{ name: 'name', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'buyName', inputs: [{ name: 'name', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'sendTip', inputs: [{ name: 'toName', type: 'string' }, { name: 'amount', type: 'uint256' }, { name: 'note', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
] as const

export const REPUTATION_ABI = [
  { type: 'function', name: 'getTier', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getReputation', inputs: [{ name: 'user', type: 'address' }], outputs: [{ components: [{ name: 'salesCompleted', type: 'uint32' }, { name: 'purchasesCompleted', type: 'uint32' }, { name: 'tipsGiftsGiven', type: 'uint32' }, { name: 'memberSince', type: 'uint64' }, { name: 'disputeFlags', type: 'uint16' }], type: 'tuple' }], stateMutability: 'view' },
] as const

export const USDC_ABI = [
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const
