// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/GameEscrow.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_CONTRACT_ADDRESS");
        address serverAddress = vm.envAddress("SERVER_WALLET_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        GameEscrow escrow = new GameEscrow(usdcAddress, serverAddress);
        
        console.log("GameEscrow deployed at:", address(escrow));
        console.log("USDC Token:", usdcAddress);
        console.log("Server Address:", serverAddress);
        
        vm.stopBroadcast();
    }
}
