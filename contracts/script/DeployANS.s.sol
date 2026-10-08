// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ANSReputation} from "../ANSReputation.sol";
import {ArcNameService} from "../ArcNameService.sol";

/// @notice Deploys ANSReputation + ArcNameService on Arc Testnet,
///         then wires them together by calling setAnsContract().
///
/// Required env vars (set in .env or export before running):
///   DEPLOYER_PRIVATE_KEY  - private key of the deployer wallet (owner)
///
/// Run with:
///   forge script contracts/script/DeployANS.s.sol \
///     --rpc-url arc_testnet \
///     --broadcast \
///     --verify \
///     --verifier blockscout \
///     --verifier-url https://explorer.testnet.arc.io/api \
///     -vvvv
contract DeployANS is Script {
    // Arc Testnet USDC address
    address constant USDC = 0x3600000000000000000000000000000000000000;

    // Owner wallet (from AGENTS.md)
    address constant OWNER = 0x315EED96725dFbdDeFcdF35673634CD1eCEB9433;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== ANS Deployment ===");
        console.log("Deployer  :", deployer);
        console.log("Owner     :", OWNER);
        console.log("USDC      :", USDC);
        console.log("Network   : Arc Testnet (Chain ID 5042002)");
        console.log("");

        vm.startBroadcast(deployerKey);

        // 1. Deploy ANSReputation
        ANSReputation reputation = new ANSReputation(OWNER);
        console.log("ANSReputation deployed at:", address(reputation));

        // 2. Deploy ArcNameService — constructor: (usdc, reputation, owner)
        ArcNameService ans = new ArcNameService(USDC, address(reputation), OWNER);
        console.log("ArcNameService deployed at:", address(ans));

        // 3. Wire reputation -> ANS (setAnsContract)
        //    Only works if deployer == OWNER. If not, this call must be done
        //    manually from the owner wallet after deployment.
        if (deployer == OWNER) {
            reputation.setAnsContract(address(ans));
            console.log("setAnsContract() called — contracts are wired!");
        } else {
            console.log("WARNING: Deployer is not OWNER.");
            console.log("You must call setAnsContract() manually from the owner wallet:");
            console.log("  cast send", address(reputation),
                "\"setAnsContract(address)\"", address(ans),
                "--rpc-url https://rpc.testnet.arc.io --private-key <OWNER_KEY>");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Update AGENTS.md with new addresses:");
        console.log("  ANSReputation  :", address(reputation));
        console.log("  ArcNameService :", address(ans));
        console.log("");
        console.log("Explorer links:");
        console.log("  https://explorer.testnet.arc.io/address/", address(reputation));
        console.log("  https://explorer.testnet.arc.io/address/", address(ans));
    }
}
