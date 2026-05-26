const { upgrades } = require("hardhat");

const PROXY = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";

async function main() {
  const impl = await upgrades.erc1967.getImplementationAddress(PROXY);
  console.log("Implementation address:", impl);
}

main().catch(console.error);
