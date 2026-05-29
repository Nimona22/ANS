const { ethers, upgrades } = require("hardhat");

const REVERSE_REGISTRY = "0x7cF67bec770f4eC9A744b9D4a1233ef5C21a756c";

async function main() {
  const reverseRegistry = await ethers.getContractAt("ANSReverseRegistry", REVERSE_REGISTRY);

  const owner    = await reverseRegistry.owner();
  const registry = await reverseRegistry.registry();

  console.log("Proxy:    ", REVERSE_REGISTRY);
  console.log("Owner:    ", owner);
  console.log("Registry: ", registry);

  const impl = await upgrades.erc1967.getImplementationAddress(REVERSE_REGISTRY);
  console.log("Implementation:", impl);
}

main().catch(console.error);
