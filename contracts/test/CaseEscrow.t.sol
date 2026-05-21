// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CaseEscrow } from "../src/CaseEscrow.sol";
import { MockUSDC } from "./MockUSDC.sol";
import { ERC1967Proxy } from "openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract CaseEscrowTest is Test {
    MockUSDC private usdc;
    CaseEscrow private escrow;

    address private petitioner = address(0xCA5E);
    address private agentWallet = address(0xA6E7);
    address private treasury = address(0x7EA5);

    function setUp() public {
        usdc = new MockUSDC();
        CaseEscrow implementation = new CaseEscrow();
        escrow = CaseEscrow(
            address(
                new ERC1967Proxy(
                    address(implementation),
                    abi.encodeCall(CaseEscrow.initialize, (address(this), address(usdc), treasury, 500))
                )
            )
        );
        escrow.setClerk(address(this), true);

        usdc.mint(petitioner, 1_000_000);
        vm.prank(petitioner);
        usdc.approve(address(escrow), 1_000_000);
    }

    function testOpenPayAndCloseCase() public {
        vm.prank(petitioner);
        uint256 caseId = escrow.openCase(1_000_000, keccak256("Will ETH outperform SOL?"), "ipfs://case");

        escrow.payAgent(caseId, agentWallet, 200_000, keccak256("Pythia testimony"));
        escrow.closeCase(caseId);

        assertEq(usdc.balanceOf(agentWallet), 200_000);
        assertEq(usdc.balanceOf(treasury), 50_000);
        assertEq(usdc.balanceOf(petitioner), 750_000);
    }
}
