global.window = {
  location: {
    hostname: 'localhost',
  },
};

import { toModularTransport } from '@circle-fin/modular-wallets-core';
import { arcTestnet } from 'viem/chains';

const clientKey = 'TEST_CLIENT_KEY:b043e8d3264fe4bbeff25ac4638f894c:f971dfacc68d119a207411a0b8885c33';
const clientUrl = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

const transport = toModularTransport(`${clientUrl}/arcTestnet`, clientKey);
const req = transport({ chain: arcTestnet }).request;

async function testPaymaster() {
  const dummyAccount = '0x1234567890123456789012345678901234567890';
  const entryPoint = '0x0000000071727de22e5e9d8baf0edac6f37da032';
  
  try {
    const res = await req({
      method: 'pm_getPaymasterStubData',
      params: [
        {
          sender: dummyAccount,
          nonce: '0x0',
          initCode: '0x',
          callData: '0x',
          callGasLimit: '0x10000',
          verificationGasLimit: '0x10000',
          preVerificationGas: '0x10000',
          maxFeePerGas: '0x1000000',
          maxPriorityFeePerGas: '0x1000000',
        },
        entryPoint,
        '0x4cef52',
        {}
      ]
    });
    console.log('[SUCCESS] pm_getPaymasterStubData:', res);
  } catch (err) {
    console.log('[FAILED] pm_getPaymasterStubData:');
    console.log('Error message:', err.message);
    console.log('Error details:', err.details);
  }
}

testPaymaster();
