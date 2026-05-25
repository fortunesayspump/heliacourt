// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract CourtReceipts is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    mapping(address account => bool approvedRecorder) public recorders;

    event RecorderSet(address indexed recorder, bool approved);
    event CaseEventRecorded(
        uint256 indexed caseId,
        bytes32 indexed eventType,
        address indexed recorder,
        bytes32 contentHash,
        string uri
    );
    event VerdictRecorded(
        uint256 indexed caseId,
        bytes32 indexed verdictHash,
        uint16 confidenceBps,
        string uri
    );

    modifier onlyRecorder() {
        require(msg.sender == owner() || recorders[msg.sender], "not recorder");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    function setRecorder(address recorder, bool approved) external onlyOwner {
        recorders[recorder] = approved;
        emit RecorderSet(recorder, approved);
    }

    function recordCaseEvent(uint256 caseId, bytes32 eventType, bytes32 contentHash, string calldata uri)
        external
        onlyRecorder
    {
        emit CaseEventRecorded(caseId, eventType, msg.sender, contentHash, uri);
    }

    function recordVerdict(uint256 caseId, bytes32 verdictHash, uint16 confidenceBps, string calldata uri)
        external
        onlyRecorder
    {
        require(confidenceBps <= 10_000, "confidence too high");
        emit VerdictRecorded(caseId, verdictHash, confidenceBps, uri);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
