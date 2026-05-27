import { ethers } from "hardhat";

async function main() {
  const REGISTRAR_PROXY  = "0xd1C027318d606Ed213c605dEe169BcDB215767a9";
  const RESOLVER_ADDRESS = "0x50d4bFA1b2630879012EC599F396a7869531445b";

  const registrar = await ethers.getContractAt("ANSRegistrar", REGISTRAR_PROXY);
  
  console.log("Wiring ANSResolver as default resolver...");
  const tx = await registrar.setDefaultResolver(RESOLVER_ADDRESS);
  await tx.wait();
  
  console.log("Done. Default resolver set to:", RESOLVER_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
