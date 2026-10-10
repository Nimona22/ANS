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

async function testMethod(name, payload) {
  try {
    const res = await req(payload);
    console.log(`[SUCCESS] ${name}:`, res);
  } catch (err) {
    console.log(`[FAILED] ${name}:`, err.message || err.details || err);
  }
}

async function run() {
  await testMethod('eth_supportedEntryPoints', { method: 'eth_supportedEntryPoints' });
  await testMethod('circle_getUserOperationGasPrice', { method: 'circle_getUserOperationGasPrice' });
  await testMethod('eth_blockNumber', { method: 'eth_blockNumber' });
  await testMethod('eth_gasPrice', { method: 'eth_gasPrice' });
}

run();
