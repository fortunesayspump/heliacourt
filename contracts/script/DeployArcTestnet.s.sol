// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { CaseEscrow } from "../src/CaseEscrow.sol";
import { CourtReceipts } from "../src/CourtReceipts.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DeployArcTestnet is Script {
    address private constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (AgentRegistry agentRegistry, CaseEscrow caseEscrow, CourtReceipts courtReceipts) {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address owner = msg.sender;
        uint16 protocolFeeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(500)));

        vm.startBroadcast();

        AgentRegistry agentRegistryImplementation = new AgentRegistry();
        CourtReceipts courtReceiptsImplementation = new CourtReceipts();
        CaseEscrow caseEscrowImplementation = new CaseEscrow();

        agentRegistry = AgentRegistry(
            address(
                new ERC1967Proxy(
                    address(agentRegistryImplementation),
                    abi.encodeCall(AgentRegistry.initialize, (owner))
                )
            )
        );
        courtReceipts = CourtReceipts(
            address(
                new ERC1967Proxy(
                    address(courtReceiptsImplementation),
                    abi.encodeCall(CourtReceipts.initialize, (owner))
                )
            )
        );
        caseEscrow = CaseEscrow(
            address(
                new ERC1967Proxy(
                    address(caseEscrowImplementation),
                    abi.encodeCall(CaseEscrow.initialize, (owner, ARC_TESTNET_USDC, treasury, protocolFeeBps))
                )
            )
        );

        vm.stopBroadcast();
    }
}
