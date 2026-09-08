// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/GameEscrow.sol";

/**
 * @title DeployScript
 * @notice Deploys GameEscrow to Base Sepolia (chain id 84532).
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY   - broadcaster; needs Base Sepolia ETH for gas
 *   USDC_CONTRACT_ADDRESS  - Base Sepolia USDC
 *   SERVER_WALLET_ADDRESS  - account authorised to settle / cancel games
 *
 * Writes deployments/base-sepolia.json.
 */
contract DeployScript is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address serverAddress = vm.envAddress("SERVER_WALLET_ADDRESS");

        require(usdcAddress != address(0), "USDC_CONTRACT_ADDRESS is zero");
        require(serverAddress != address(0), "SERVER_WALLET_ADDRESS is zero");
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) {
            console.log("WARNING: expected chain id 84532 (Base Sepolia), got", block.chainid);
        }

        vm.startBroadcast(deployerPrivateKey);
        GameEscrow escrow = new GameEscrow(usdcAddress, serverAddress);
        vm.stopBroadcast();

        console.log("GameEscrow deployed at:", address(escrow));
        console.log("USDC Token:", usdcAddress);
        console.log("Server Address:", serverAddress);
        console.log("Owner:", escrow.owner());

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", BASE_SEPOLIA_CHAIN_ID);
        vm.serializeAddress(obj, "escrow", address(escrow));
        vm.serializeAddress(obj, "usdc", usdcAddress);
        vm.serializeAddress(obj, "server", serverAddress);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);
        vm.writeJson(json, "./deployments/base-sepolia.json");
        console.log("Wrote deployments/base-sepolia.json");
    }
}
