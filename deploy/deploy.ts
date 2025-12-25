import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const confidentialUsdc = await deploy("ConfidentialUSDC", {
    from: deployer,
    log: true,
  });

  log(`ConfidentialUSDC contract: ${confidentialUsdc.address}`);

  const phantomPad = await deploy("PhantomPad", {
    from: deployer,
    args: [confidentialUsdc.address],
    log: true,
  });

  log(`PhantomPad contract: ${phantomPad.address}`);
};
export default func;
func.id = "deploy_phantompad"; // id required to prevent reexecution
func.tags = ["ConfidentialUSDC", "PhantomPad"];
