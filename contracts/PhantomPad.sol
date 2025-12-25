// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

/// @title PhantomPad Crowdfunding with confidential cUSDC support
/// @notice Supports encrypted contributions tracked with Zama FHE
contract PhantomPad is ZamaEthereumConfig, IERC7984Receiver {
    struct Campaign {
        string name;
        euint64 target;
        euint64 totalRaised;
        uint256 deadline;
        address creator;
        bool ended;
    }

    ConfidentialUSDC public immutable paymentToken;
    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => euint64)) private _contributions;

    event CampaignCreated(uint256 indexed campaignId, string name, uint64 target, uint256 deadline, address indexed creator);
    event Contributed(uint256 indexed campaignId, address indexed contributor, euint64 encryptedAmount);
    event CampaignEnded(uint256 indexed campaignId, address indexed creator, euint64 encryptedPayout);

    constructor(ConfidentialUSDC token) {
        paymentToken = token;
    }

    /// @notice Create a new fundraising campaign
    /// @param name Name of the campaign
    /// @param target Target amount in cUSDC (clear text for UX)
    /// @param deadline Timestamp when contributions should stop
    /// @return campaignId The created campaign identifier
    function createCampaign(string calldata name, uint64 target, uint256 deadline) external returns (uint256 campaignId) {
        require(bytes(name).length > 0, "Name required");
        require(target > 0, "Target required");
        require(deadline > block.timestamp, "Deadline must be in the future");

        campaignId = ++campaignCount;

        euint64 encryptedTarget = FHE.asEuint64(target);
        euint64 initialRaised = FHE.asEuint64(0);

        Campaign storage campaign = _campaigns[campaignId];
        campaign.name = name;
        campaign.target = encryptedTarget;
        campaign.totalRaised = initialRaised;
        campaign.deadline = deadline;
        campaign.creator = msg.sender;
        campaign.ended = false;

        FHE.allowThis(encryptedTarget);
        FHE.allow(encryptedTarget, msg.sender);
        FHE.allowThis(initialRaised);
        FHE.allow(initialRaised, msg.sender);

        emit CampaignCreated(campaignId, name, target, deadline, msg.sender);
    }

    /// @notice Handle confidential transfers sent with `confidentialTransferAndCall`
    /// @dev data must be abi-encoded campaignId
    function onConfidentialTransferReceived(
        address /*operator*/,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override returns (ebool) {
        require(msg.sender == address(paymentToken), "Unsupported token");
        uint256 campaignId = abi.decode(data, (uint256));
        Campaign storage campaign = _campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign not found");
        require(!campaign.ended, "Campaign already ended");
        require(block.timestamp <= campaign.deadline, "Campaign expired");

        euint64 updatedTotal = FHE.add(campaign.totalRaised, amount);
        campaign.totalRaised = updatedTotal;
        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, campaign.creator);
        FHE.allow(updatedTotal, from);

        euint64 currentContribution = _contributions[campaignId][from];
        if (!FHE.isInitialized(currentContribution)) {
            currentContribution = FHE.asEuint64(0);
        }
        euint64 updatedContribution = FHE.add(currentContribution, amount);
        _contributions[campaignId][from] = updatedContribution;
        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, from);

        emit Contributed(campaignId, from, amount);

        ebool accepted = FHE.asEbool(true);
        FHE.allowThis(accepted);
        FHE.allow(accepted, msg.sender);
        return accepted;
    }

    /// @notice End a campaign and send collected cUSDC to the creator
    /// @param campaignId Target campaign identifier
    /// @return payout The encrypted payout sent to the creator
    function endCampaign(uint256 campaignId) external returns (euint64 payout) {
        Campaign storage campaign = _campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign not found");
        require(msg.sender == campaign.creator, "Only creator");
        require(!campaign.ended, "Campaign already ended");

        campaign.ended = true;
        payout = campaign.totalRaised;

        FHE.allowThis(payout);
        FHE.allow(payout, msg.sender);

        campaign.totalRaised = FHE.asEuint64(0);
        payout = paymentToken.confidentialTransfer(msg.sender, payout);

        emit CampaignEnded(campaignId, msg.sender, payout);
    }

    /// @notice Retrieve campaign data
    /// @param campaignId Target campaign identifier
    /// @return name Campaign name
    /// @return target Campaign target (encrypted)
    /// @return deadline Campaign deadline
    /// @return ended True if creator closed the campaign
    /// @return totalRaised Encrypted total raised so far
    /// @return creator Address that created the campaign
    function getCampaign(
        uint256 campaignId
    ) external view returns (string memory name, euint64 target, uint256 deadline, bool ended, euint64 totalRaised, address creator) {
        Campaign storage campaign = _campaigns[campaignId];
        name = campaign.name;
        target = campaign.target;
        deadline = campaign.deadline;
        ended = campaign.ended;
        totalRaised = campaign.totalRaised;
        creator = campaign.creator;
    }

    /// @notice Return an encrypted contribution for a user
    /// @param campaignId Target campaign identifier
    /// @param user Address of contributor
    function contributionOf(uint256 campaignId, address user) external view returns (euint64) {
        return _contributions[campaignId][user];
    }

    /// @notice Returns whether a campaign is active
    /// @param campaignId Target campaign identifier
    function isCampaignActive(uint256 campaignId) external view returns (bool) {
        Campaign storage campaign = _campaigns[campaignId];
        return campaign.creator != address(0) && !campaign.ended && block.timestamp <= campaign.deadline;
    }

    /// @notice Exposes the contract cUSDC balance for transparency
    function treasuryBalance() external view returns (euint64) {
        return paymentToken.confidentialBalanceOf(address(this));
    }
}
