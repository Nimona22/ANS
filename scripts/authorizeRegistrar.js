const { ethers } = require("hardhat");

const REGISTRY_ADDRESS   = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";
const REGISTRAR_ADDRESS  = "0xd1C027318d606Ed213c605dEe169BcDB215767a9";

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("ANSRegistry", REGISTRY_ADDRESS);

  console.log("Authorizing registrar...");
  const tx = await registry.setRegistrar(REGISTRAR_ADDRESS, true);
  await tx.wait();

  const isReg = await registry.isRegistrar(REGISTRAR_ADDRESS);
  console.log("Registrar authorized:", isReg);
}

main().catch(console.error);
