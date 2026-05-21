// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "openzeppelin-contracts-upgradeable/contracts/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "openzeppelin-contracts-upgradeable/contracts/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "openzeppelin-contracts-upgradeable/contracts/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "./interfaces/IERC20.sol";

contract CaseEscrow is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    enum CaseStatus {
        None,
        Open,
        Closed,
        Cancelled
    }

    struct CourtCase {
        address petitioner;
        uint96 budget;
        uint96 paidOut;
        CaseStatus status;
        bytes32 questionHash;
        string metadataURI;
    }

    IERC20 public usdc;
    address public treasury;
    uint16 public protocolFeeBps;
    uint256 public nextCaseId;

    mapping(uint256 caseId => CourtCase courtCase) public cases;
    mapping(address account => bool approvedClerk) public clerks;

    event ClerkSet(address indexed clerk, bool approved);
    event TreasuryUpdated(address indexed treasury);
    event ProtocolFeeUpdated(uint16 protocolFeeBps);
    event CaseOpened(uint256 indexed caseId, address indexed petitioner, uint96 budget, bytes32 questionHash, string metadataURI);
    event AgentPaid(uint256 indexed caseId, address indexed agentWallet, uint96 amount, bytes32 reasonHash);
    event CaseClosed(uint256 indexed caseId, uint96 protocolFee, uint96 refund);
    event CaseCancelled(uint256 indexed caseId, uint96 refund);

    modifier onlyClerk() {
        require(msg.sender == owner() || clerks[msg.sender], "not clerk");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address usdc_, address treasury_, uint16 protocolFeeBps_) external initializer {
        require(usdc_ != address(0), "usdc required");
        require(treasury_ != address(0), "treasury required");
        require(protocolFeeBps_ <= 1_000, "fee too high");

        __Ownable_init(owner_);

        usdc = IERC20(usdc_);
        treasury = treasury_;
        protocolFeeBps = protocolFeeBps_;
        nextCaseId = 1;
    }

    function setClerk(address clerk, bool approved) external onlyOwner {
        clerks[clerk] = approved;
        emit ClerkSet(clerk, approved);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury required");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setProtocolFee(uint16 protocolFeeBps_) external onlyOwner {
        require(protocolFeeBps_ <= 1_000, "fee too high");
        protocolFeeBps = protocolFeeBps_;
        emit ProtocolFeeUpdated(protocolFeeBps_);
    }

    function openCase(uint96 budget, bytes32 questionHash, string calldata metadataURI) external returns (uint256 caseId) {
        require(budget > 0, "budget required");
        require(usdc.transferFrom(msg.sender, address(this), budget), "funding failed");

        caseId = nextCaseId++;
        cases[caseId] = CourtCase({
            petitioner: msg.sender,
            budget: budget,
            paidOut: 0,
            status: CaseStatus.Open,
            questionHash: questionHash,
            metadataURI: metadataURI
        });

        emit CaseOpened(caseId, msg.sender, budget, questionHash, metadataURI);
    }

    function payAgent(uint256 caseId, address agentWallet, uint96 amount, bytes32 reasonHash) external onlyClerk {
        CourtCase storage courtCase = cases[caseId];
        require(courtCase.status == CaseStatus.Open, "case not open");
        require(agentWallet != address(0), "agent wallet required");
        require(courtCase.paidOut + amount <= courtCase.budget, "budget exceeded");

        courtCase.paidOut += amount;
        require(usdc.transfer(agentWallet, amount), "payout failed");

        emit AgentPaid(caseId, agentWallet, amount, reasonHash);
    }

    function closeCase(uint256 caseId) external onlyClerk {
        CourtCase storage courtCase = cases[caseId];
        require(courtCase.status == CaseStatus.Open, "case not open");

        courtCase.status = CaseStatus.Closed;

        uint96 remaining = courtCase.budget - courtCase.paidOut;
        uint96 protocolFee = uint96((uint256(courtCase.budget) * protocolFeeBps) / 10_000);
        if (protocolFee > remaining) {
            protocolFee = remaining;
        }

        uint96 refund = remaining - protocolFee;
        if (protocolFee > 0) {
            require(usdc.transfer(treasury, protocolFee), "fee failed");
        }
        if (refund > 0) {
            require(usdc.transfer(courtCase.petitioner, refund), "refund failed");
        }

        emit CaseClosed(caseId, protocolFee, refund);
    }

    function cancelCase(uint256 caseId) external {
        CourtCase storage courtCase = cases[caseId];
        require(courtCase.status == CaseStatus.Open, "case not open");
        require(msg.sender == courtCase.petitioner || clerks[msg.sender] || msg.sender == owner(), "not authorized");

        courtCase.status = CaseStatus.Cancelled;
        uint96 refund = courtCase.budget - courtCase.paidOut;
        if (refund > 0) {
            require(usdc.transfer(courtCase.petitioner, refund), "refund failed");
        }

        emit CaseCancelled(caseId, refund);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
