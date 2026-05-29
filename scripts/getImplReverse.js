const { upgrades } = require("hardhat");

const PROXY = "0x8f85aB4c3Bd2324d0a210673baC86a5fFcbBc27C";

async function main() {
  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("Proxy:", PROXY);
  console.log("Implementation:", impl);
}

main().catch(console.error);
