// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CourtReceipts {
    address public owner;
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

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRecorder() {
        require(msg.sender == owner || recorders[msg.sender], "not recorder");
        _;
    }

    constructor() {
        owner = msg.sender;
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
}
