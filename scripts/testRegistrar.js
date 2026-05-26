const { ethers } = require("hardhat");

const REGISTRAR_ADDRESS = "0xd1C027318d606Ed213c605dEe169BcDB215767a9";
const REGISTRY_ADDRESS  = "0xBBE91358c99CB1b78577d9559Ee657C6FE727193";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with:", deployer.address);

  const registrar = await ethers.getContractAt("ANSRegistrar", REGISTRAR_ADDRESS);
  const registry  = await ethers.getContractAt("ANSRegistry",  REGISTRY_ADDRESS);

  const DURATION_12M = 365 * 24 * 60 * 60;
  const secret       = ethers.utils.formatBytes32String("mysecret123");
  const name         = "alice";

  // -- TEST 1: calculatePrice ------------------------------------------------
  console.log("\n--- TEST 1: calculatePrice ---");
  const price5char = await registrar.calculatePrice(5, DURATION_12M);
  const price4char = await registrar.calculatePrice(4, DURATION_12M);
  const price3char = await registrar.calculatePrice(3, DURATION_12M);
  console.log("5 char price (1yr):", ethers.utils.formatEther(price5char), "USDC");
  console.log("4 char price (1yr):", ethers.utils.formatEther(price4char), "USDC");
  console.log("3 char price (1yr):", ethers.utils.formatEther(price3char), "USDC");
  console.log("TEST 1 PASSED ?");

  // -- TEST 2: available() ---------------------------------------------------
  console.log("\n--- TEST 2: available() ---");
  const isAvail = await registrar.available(name);
  console.log("alice available:", isAvail);
  console.log("TEST 2 PASSED ?");

  // -- TEST 3: makeCommitment + commit ---------------------------------------
  console.log("\n--- TEST 3: commit ---");
  const commitment = await registrar.makeCommitment(name, deployer.address, secret);
  console.log("Commitment:", commitment);
  const tx3 = await registrar.commit(commitment);
  await tx3.wait();
  console.log("Committed TX:", tx3.hash);
  console.log("TEST 3 PASSED ?");

  // -- Wait for MIN_COMMIT_AGE (61 seconds) ----------------------------------
  console.log("\nWaiting 65 seconds for commit delay...");
  await new Promise(r => setTimeout(r, 65000));

  // -- TEST 4: register ------------------------------------------------------
  console.log("\n--- TEST 4: register ---");
  const price = await registrar.calculatePrice(name.length, DURATION_12M);
  console.log("Price:", ethers.utils.formatEther(price), "USDC");

  const tx4 = await registrar.register(name, deployer.address, secret, DURATION_12M, {
    value: price
  });
  await tx4.wait();
  console.log("Registered TX:", tx4.hash);
  console.log("TEST 4 PASSED ?");

  // -- TEST 5: verify in registry --------------------------------------------
  console.log("\n--- TEST 5: verify registry ---");
  const namehash = await registrar.namehashOf(name);
  const owner    = await registry.ownerOf(namehash);
  const exists   = await registry.exists(namehash);
  console.log("Owner in registry:", owner);
  console.log("Exists:", exists);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) throw new Error("Owner mismatch");
  console.log("TEST 5 PASSED ?");

  // -- TEST 6: available() returns false after registration ------------------
  console.log("\n--- TEST 6: not available after registration ---");
  const isAvail2 = await registrar.available(name);
  console.log("alice available:", isAvail2);
  if (isAvail2) throw new Error("Should not be available");
  console.log("TEST 6 PASSED ?");

  // -- TEST 7: reject short name ---------------------------------------------
  console.log("\n--- TEST 7: reject short name ---");
  try {
    await registrar.available("ab");
    console.log("TEST 7 FAILED ?");
  } catch(e) {
    console.log("Correctly rejected short name");
    console.log("TEST 7 PASSED ?");
  }

  // -- TEST 8: reject invalid name -------------------------------------------
  console.log("\n--- TEST 8: reject invalid characters ---");
  try {
    const c2 = await registrar.makeCommitment("Alice!", deployer.address, secret);
    await registrar.commit(c2);
    await new Promise(r => setTimeout(r, 65000));
    await registrar.register("Alice!", deployer.address, secret, DURATION_12M, { value: price });
    console.log("TEST 8 FAILED ?");
  } catch(e) {
    console.log("Correctly rejected invalid name");
    console.log("TEST 8 PASSED ?");
  }

  // -- TEST 9: renew ---------------------------------------------------------
  console.log("\n--- TEST 9: renew ---");
  const renewPrice = await registrar.calculatePrice(name.length, DURATION_12M);
  const tx9 = await registrar.renew(name, DURATION_12M, { value: renewPrice });
  await tx9.wait();
  console.log("Renewed TX:", tx9.hash);
  console.log("TEST 9 PASSED ?");

  console.log("\n=============================");
  console.log("ALL TESTS COMPLETE ?");
  console.log("=============================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
