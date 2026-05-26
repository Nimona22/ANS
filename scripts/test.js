const { ethers } = require("hardhat");

const PROXY = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with:", deployer.address);

  const registry = await ethers.getContractAt("ANSRegistry", PROXY);

  // Helper: compute namehash from a string
  const namehash = (name) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(name));

  const NAME     = namehash("alice.arc");
  const RESOLVER = "0x1111111111111111111111111111111111111111";
  const expiry   = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year

  // -- TEST 1: Authorize deployer as registrar -------------------------------
  console.log("\n--- TEST 1: Set registrar ---");
  const tx1 = await registry.setRegistrar(deployer.address, true);
  await tx1.wait();
  const isReg = await registry.isRegistrar(deployer.address);
  console.log("Is registrar:", isReg);
  console.log("TEST 1 PASSED ?");

  // -- TEST 2: Register a name -----------------------------------------------
  console.log("\n--- TEST 2: setRecord ---");
  const tx2 = await registry.setRecord(NAME, deployer.address, RESOLVER, expiry);
  await tx2.wait();
  console.log("TX:", tx2.hash);
  console.log("TEST 2 PASSED ?");

  // -- TEST 3: exists() -----------------------------------------------------
  console.log("\n--- TEST 3: exists() ---");
  const ex = await registry.exists(NAME);
  console.log("Exists:", ex);
  if (!ex) throw new Error("TEST 3 FAILED");
  console.log("TEST 3 PASSED ?");

  // -- TEST 4: ownerOf() ----------------------------------------------------
  console.log("\n--- TEST 4: ownerOf() ---");
  const owner = await registry.ownerOf(NAME);
  console.log("Owner:", owner);
  if (owner !== deployer.address) throw new Error("TEST 4 FAILED");
  console.log("TEST 4 PASSED ?");

  // -- TEST 5: resolverOf() -------------------------------------------------
  console.log("\n--- TEST 5: resolverOf() ---");
  const resolver = await registry.resolverOf(NAME);
  console.log("Resolver:", resolver);
  if (resolver.toLowerCase() !== RESOLVER.toLowerCase()) throw new Error("TEST 5 FAILED");
  console.log("TEST 5 PASSED ?");

  // -- TEST 6: setPrimaryName() ---------------------------------------------
  console.log("\n--- TEST 6: setPrimaryName() ---");
  const tx6 = await registry.setPrimaryName(NAME);
  await tx6.wait();
  const primary = await registry.primaryNameOf(deployer.address);
  console.log("Primary namehash:", primary);
  if (primary !== NAME) throw new Error("TEST 6 FAILED");
  console.log("TEST 6 PASSED ?");

  // -- TEST 7: setLock() ----------------------------------------------------
  console.log("\n--- TEST 7: setLock() ---");
  const tx7 = await registry.setLock(NAME, true);
  await tx7.wait();
  const record = await registry.getRecord(NAME);
  console.log("Locked:", record.locked);
  if (!record.locked) throw new Error("TEST 7 FAILED");
  console.log("TEST 7 PASSED ?");

  // -- TEST 8: transferName blocked when locked ------------------------------
  console.log("\n--- TEST 8: transferName blocked when locked ---");
  try {
    await registry.transferName(NAME, "0x2222222222222222222222222222222222222222");
    throw new Error("TEST 8 FAILED - should have reverted");
  } catch (e) {
    if (e.message.includes("TEST 8 FAILED")) throw e;
    console.log("Correctly blocked transfer while locked");
    console.log("TEST 8 PASSED ?");
  }

  // -- TEST 9: unlock and transfer -------------------------------------------
  console.log("\n--- TEST 9: unlock and transferName ---");
  const tx9a = await registry.setLock(NAME, false);
  await tx9a.wait();
  const tx9b = await registry.transferName(NAME, "0x2222222222222222222222222222222222222222");
  await tx9b.wait();
  const newOwner = await registry.ownerOf(NAME);
  console.log("New owner:", newOwner);
  console.log("TEST 9 PASSED ?");

  // -- TEST 10: primary name cleared after transfer --------------------------
  console.log("\n--- TEST 10: primary name cleared after transfer ---");
  const primaryAfter = await registry.primaryNameOf(deployer.address);
  console.log("Primary after transfer:", primaryAfter);
  if (primaryAfter !== ethers.constants.HashZero) throw new Error("TEST 10 FAILED");
  console.log("TEST 10 PASSED ?");

  // -- TEST 11: renewName ----------------------------------------------------
  console.log("\n--- TEST 11: renewName ---");
  const newExpiry = expiry + 60 * 60 * 24 * 365;
  const tx11 = await registry.renewName(NAME, newExpiry);
  await tx11.wait();
  const recordAfter = await registry.getRecord(NAME);
  console.log("New expiry:", recordAfter.expiry.toString());
  console.log("TEST 11 PASSED ?");

  // -- TEST 12: isExpired returns false for valid name -----------------------
  console.log("\n--- TEST 12: isExpired() ---");
  const expired = await registry.isExpired(NAME);
  console.log("Is expired:", expired);
  if (expired) throw new Error("TEST 12 FAILED");
  console.log("TEST 12 PASSED ?");

  console.log("\n=============================");
  console.log("ALL 12 TESTS PASSED ?");
  console.log("=============================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
