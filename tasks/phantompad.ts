import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:phantompad:addresses", "Print deployed contract addresses").setAction(async (_taskArguments: TaskArguments, hre) => {
  const { deployments } = hre;

  const cusdc = await deployments.get("ConfidentialUSDC");
  const phantomPad = await deployments.get("PhantomPad");

  console.log(`ConfidentialUSDC address: ${cusdc.address}`);
  console.log(`PhantomPad address     : ${phantomPad.address}`);
});

task("task:phantompad:mint", "Mint cUSDC to an address")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount to mint (uint64)")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments } = hre;

    const recipient = taskArguments.to as string;
    const amount = BigInt(taskArguments.amount);

    const { address } = await deployments.get("ConfidentialUSDC");
    const signer = (await ethers.getSigners())[0];
    const cusdc = await ethers.getContractAt("ConfidentialUSDC", address);

    const tx = await cusdc.connect(signer).mint(recipient, amount);
    console.log(`Minting ${amount} cUSDC to ${recipient}...`);
    await tx.wait();
    console.log(`Minted to ${recipient} in tx ${tx.hash}`);
  });

task("task:phantompad:create", "Create a crowdfunding campaign")
  .addParam("name", "Campaign name")
  .addParam("target", "Target amount in cUSDC (uint64)")
  .addParam("deadline", "Deadline timestamp (in seconds)")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const { address } = await deployments.get("PhantomPad");

    const signer = (await ethers.getSigners())[0];
    const phantomPad = await ethers.getContractAt("PhantomPad", address);

    const target = BigInt(taskArguments.target);
    const deadline = BigInt(taskArguments.deadline);

    const tx = await phantomPad.connect(signer).createCampaign(taskArguments.name as string, target, Number(deadline));
    console.log(`Creating campaign "${taskArguments.name}"...`);
    await tx.wait();
    console.log(`Campaign created in tx ${tx.hash}`);
  });

task("task:phantompad:contribute", "Contribute encrypted cUSDC to a campaign")
  .addParam("campaign", "Campaign identifier")
  .addParam("amount", "Contribution amount (uint64)")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const phantomPadDeployment = await deployments.get("PhantomPad");
    const cusdcDeployment = await deployments.get("ConfidentialUSDC");
    const cusdc = await ethers.getContractAt("ConfidentialUSDC", cusdcDeployment.address);

    const campaignId = Number(taskArguments.campaign);
    const amount = Number(taskArguments.amount);

    const signer = (await ethers.getSigners())[0];

    const input = fhevm.createEncryptedInput(cusdcDeployment.address, signer.address);
    input.add64(amount);
    const encrypted = await input.encrypt();

    const tx = await cusdc
      .connect(signer)
      [
        "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
      ](
        phantomPadDeployment.address,
        encrypted.handles[0],
        encrypted.inputProof,
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [campaignId])
      );
    console.log(`Contributing to campaign ${campaignId} with encrypted cUSDC...`);
    await tx.wait();
    console.log(`Contribution confirmed in tx ${tx.hash}`);
  });

task("task:phantompad:decrypt-total", "Decrypt total raised for a campaign")
  .addParam("campaign", "Campaign identifier")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const phantomPadDeployment = await deployments.get("PhantomPad");
    const phantomPad = await ethers.getContractAt("PhantomPad", phantomPadDeployment.address);
    const signer = (await ethers.getSigners())[0];

    const campaignId = Number(taskArguments.campaign);
    const info = await phantomPad.getCampaign(campaignId);
    const encryptedTotal = info[4];

    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTotal,
      phantomPadDeployment.address,
      signer
    );

    console.log(`Campaign ${campaignId} total raised: ${clearTotal.toString()}`);
  });
