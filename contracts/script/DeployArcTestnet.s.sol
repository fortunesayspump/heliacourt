// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { CaseEscrow } from "../src/CaseEscrow.sol";
import { CourtReceipts } from "../src/CourtReceipts.sol";

contract DeployArcTestnet is Script {
    address private constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (AgentRegistry agentRegistry, CaseEscrow caseEscrow, CourtReceipts courtReceipts) {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint16 protocolFeeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(500)));

        vm.startBroadcast();

        agentRegistry = new AgentRegistry();
        courtReceipts = new CourtReceipts();
        caseEscrow = new CaseEscrow(ARC_TESTNET_USDC, treasury, protocolFeeBps);

        vm.stopBroadcast();
    }
}
