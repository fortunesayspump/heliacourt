// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentRegistry {
    struct Agent {
        address owner;
        address payoutWallet;
        uint96 feeQuote;
        bool active;
        string role;
        string metadataURI;
    }

    address public owner;
    uint256 public nextAgentId = 1;

    mapping(uint256 agentId => Agent agent) public agents;
    mapping(address account => bool approvedRegistrar) public registrars;

    event RegistrarSet(address indexed registrar, bool approved);
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        address indexed payoutWallet,
        string role,
        string metadataURI,
        uint96 feeQuote
    );
    event AgentUpdated(uint256 indexed agentId, string role, string metadataURI, uint96 feeQuote, bool active);
    event AgentPayoutWalletUpdated(uint256 indexed agentId, address indexed payoutWallet);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyRegistrar() {
        require(msg.sender == owner || registrars[msg.sender], "not registrar");
        _;
    }

    modifier onlyAgentOwner(uint256 agentId) {
        require(msg.sender == agents[agentId].owner, "not agent owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setRegistrar(address registrar, bool approved) external onlyOwner {
        registrars[registrar] = approved;
        emit RegistrarSet(registrar, approved);
    }

    function registerAgent(address agentOwner, address payoutWallet, string calldata role, string calldata metadataURI, uint96 feeQuote)
        external
        onlyRegistrar
        returns (uint256 agentId)
    {
        require(agentOwner != address(0), "agent owner required");
        require(payoutWallet != address(0), "payout wallet required");

        agentId = nextAgentId++;
        agents[agentId] = Agent({
            owner: agentOwner,
            payoutWallet: payoutWallet,
            feeQuote: feeQuote,
            active: true,
            role: role,
            metadataURI: metadataURI
        });

        emit AgentRegistered(agentId, agentOwner, payoutWallet, role, metadataURI, feeQuote);
    }

    function updateAgent(uint256 agentId, string calldata role, string calldata metadataURI, uint96 feeQuote, bool active)
        external
        onlyAgentOwner(agentId)
    {
        Agent storage agent = agents[agentId];
        agent.role = role;
        agent.metadataURI = metadataURI;
        agent.feeQuote = feeQuote;
        agent.active = active;

        emit AgentUpdated(agentId, role, metadataURI, feeQuote, active);
    }

    function updatePayoutWallet(uint256 agentId, address payoutWallet) external onlyAgentOwner(agentId) {
        require(payoutWallet != address(0), "payout wallet required");
        agents[agentId].payoutWallet = payoutWallet;

        emit AgentPayoutWalletUpdated(agentId, payoutWallet);
    }
}
