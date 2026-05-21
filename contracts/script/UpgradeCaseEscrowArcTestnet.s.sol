// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { CaseEscrow } from "../src/CaseEscrow.sol";

contract UpgradeCaseEscrowArcTestnet is Script {
    function run() external returns (CaseEscrow implementation) {
        address proxy = vm.envAddress("CASE_ESCROW_PROXY");

        vm.startBroadcast();
        implementation = new CaseEscrow();
        CaseEscrow(proxy).upgradeToAndCall(address(implementation), "");
        vm.stopBroadcast();
    }
}
