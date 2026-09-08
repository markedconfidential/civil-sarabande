// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/GameEscrow.sol";
import "../src/mocks/MockUSDC.sol";

/**
 * @title DeployLocalScript
 * @notice Local Anvil deployment (chain id 31337).
 *
 * Deploys MockUSDC and GameEscrow with the default broadcaster (pass
 * `--private-key` or `--unlocked` for Anvil account 0), mints 10,000 USDC to
 * Anvil accounts 0-3 and to the server address, and writes deployments/local.json.
 *
 * Environment (optional):
 *   SERVER_WALLET_ADDRESS - defaults to Anvil account 9.
 */
contract DeployLocalScript is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31337;
    uint256 internal constant FAUCET_AMOUNT = 10_000e6; // 10,000 USDC

    /// @dev Anvil account 9.
    address internal constant DEFAULT_SERVER = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;

    function run() external {
        address serverAddress = vm.envOr("SERVER_WALLET_ADDRESS", DEFAULT_SERVER);
        require(serverAddress != address(0), "SERVER_WALLET_ADDRESS is zero");
        if (block.chainid != LOCAL_CHAIN_ID) {
            console.log("WARNING: expected chain id 31337 (Anvil), got", block.chainid);
        }

        address[5] memory funded = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, // Anvil account 0
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8, // Anvil account 1
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, // Anvil account 2
            0x90F79bf6EB2c4f870365E785982E1f101E93b906, // Anvil account 3
            serverAddress
        ];

        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC();
        GameEscrow escrow = new GameEscrow(address(usdc), serverAddress);
        for (uint256 i = 0; i < funded.length; i++) {
            usdc.mint(funded[i], FAUCET_AMOUNT);
        }
        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(usdc));
        console.log("GameEscrow deployed at:", address(escrow));
        console.log("Server Address:", serverAddress);
        console.log("Owner:", escrow.owner());

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", LOCAL_CHAIN_ID);
        vm.serializeAddress(obj, "escrow", address(escrow));
        vm.serializeAddress(obj, "usdc", address(usdc));
        vm.serializeAddress(obj, "server", serverAddress);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);
        vm.writeJson(json, "./deployments/local.json");
        console.log("Wrote deployments/local.json");
    }
}
