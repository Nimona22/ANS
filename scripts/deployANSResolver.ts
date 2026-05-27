import { ethers, upgrades } from "hardhat";

async function main() {
  const REGISTRY_ADDRESS = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";
  const PROTOCOL_ADMIN   = "0x315EED96725dFbdDeFcdF35673634CD1eCEB9433";

  console.log("Deploying ANSResolver...");

  const ANSResolver = await ethers.getContractFactory("ANSResolver");

  const resolver = await upgrades.deployProxy(
    ANSResolver,
    [REGISTRY_ADDRESS, PROTOCOL_ADMIN],
    { initializer: "initialize", kind: "uups" }
  );

  await resolver.deployed();

  console.log("ANSResolver Proxy deployed to:", resolver.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
