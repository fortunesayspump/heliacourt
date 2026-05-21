// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { ERC1967Proxy } from "openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract AgentRegistryTest is Test {
    AgentRegistry private registry;

    address private agentOwner = address(0xA11CE);
    address private payoutWallet = address(0xB0B);

    function setUp() public {
        AgentRegistry implementation = new AgentRegistry();
        registry = AgentRegistry(
            address(new ERC1967Proxy(address(implementation), abi.encodeCall(AgentRegistry.initialize, (address(this)))))
        );
    }

    function testRegisterAgent() public {
        uint256 agentId = registry.registerAgent(agentOwner, payoutWallet, "Prediction Witness", "ipfs://agent", 40_000);

        (
            address storedOwner,
            address storedPayoutWallet,
            uint96 feeQuote,
            bool active,
            string memory role,
            string memory metadataURI
        ) = registry.agents(agentId);

        assertEq(storedOwner, agentOwner);
        assertEq(storedPayoutWallet, payoutWallet);
        assertEq(feeQuote, 40_000);
        assertTrue(active);
        assertEq(role, "Prediction Witness");
        assertEq(metadataURI, "ipfs://agent");
    }

    function testAgentOwnerCanUpdateAgent() public {
        uint256 agentId = registry.registerAgent(agentOwner, payoutWallet, "Prediction Witness", "ipfs://agent", 40_000);

        vm.prank(agentOwner);
        registry.updateAgent(agentId, "Onchain Witness", "ipfs://updated", 55_000, false);

        (, , uint96 feeQuote, bool active, string memory role, string memory metadataURI) = registry.agents(agentId);

        assertEq(feeQuote, 55_000);
        assertFalse(active);
        assertEq(role, "Onchain Witness");
        assertEq(metadataURI, "ipfs://updated");
    }
}
