import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { ConfidentialUSDC, ConfidentialUSDC__factory, PhantomPad, PhantomPad__factory } from "../types";

type Signers = {
  creator: HardhatEthersSigner;
  contributor: HardhatEthersSigner;
};

async function deployFixture() {
  const cusdcFactory = (await ethers.getContractFactory("ConfidentialUSDC")) as ConfidentialUSDC__factory;
  const cusdc = (await cusdcFactory.deploy()) as ConfidentialUSDC;

  const phantomPadFactory = (await ethers.getContractFactory("PhantomPad")) as PhantomPad__factory;
  const phantomPad = (await phantomPadFactory.deploy(await cusdc.getAddress())) as PhantomPad;

  return { cusdc, phantomPad };
}

describe("PhantomPad", function () {
  let signers: Signers;
  let cusdc: ConfidentialUSDC;
  let phantomPad: PhantomPad;
  let phantomPadAddress: string;
  let cusdcAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { creator: ethSigners[0], contributor: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ cusdc, phantomPad } = await deployFixture());
    phantomPadAddress = await phantomPad.getAddress();
    cusdcAddress = await cusdc.getAddress();
  });

  it("creates campaigns and tracks encrypted contributions", async function () {
    const futureDeadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await phantomPad.connect(signers.creator).createCampaign("Test Launch", 1_000, futureDeadline);

    await cusdc.connect(signers.contributor).mint(signers.contributor.address, 2_000);

    const encryptedInput = await fhevm
      .createEncryptedInput(cusdcAddress, signers.contributor.address)
      .add64(750)
      .encrypt();

    const tx = await cusdc
      .connect(signers.contributor)
      [
        "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
      ](
        phantomPadAddress,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1])
      );
    await tx.wait();

    const campaign = await phantomPad.getCampaign(1);
    const clearTotalRaised = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      campaign[4],
      phantomPadAddress,
      signers.creator
    );
    expect(clearTotalRaised).to.equal(750n);

    const userContribution = await phantomPad.contributionOf(1, signers.contributor.address);
    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      userContribution,
      phantomPadAddress,
      signers.contributor
    );
    expect(clearContribution).to.equal(750n);
  });

  it("lets creator end a campaign and receive encrypted payout", async function () {
    const futureDeadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    await phantomPad.connect(signers.creator).createCampaign("Payout Test", 500, futureDeadline);
    await cusdc.connect(signers.contributor).mint(signers.contributor.address, 500);

    const encryptedInput = await fhevm
      .createEncryptedInput(cusdcAddress, signers.contributor.address)
      .add64(400)
      .encrypt();
    await cusdc
      .connect(signers.contributor)
      [
        "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
      ](
        phantomPadAddress,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1])
      );

    await phantomPad.connect(signers.creator).endCampaign(1);

    const creatorBalance = await cusdc.confidentialBalanceOf(signers.creator.address);
    const clearCreatorBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      creatorBalance,
      await cusdc.getAddress(),
      signers.creator
    );

    expect(clearCreatorBalance).to.equal(400n);
  });
});
