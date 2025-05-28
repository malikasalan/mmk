const { ethers } = require('ethers');
const readline = require('readline');
require('dotenv').config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = 'https://mainnet.unichain.org';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const DEFAULT_AMOUNT = 0.000013; // Default swap amount in WETH

// Complete WETH ABI
const WETH_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "src",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "guy",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "Approval",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "dst",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "src",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dst",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "src",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "Withdrawal",
    "type": "event"
  },
  {
    "stateMutability": "payable",
    "type": "fallback"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "guy",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [
      {
        "internalType": "string",
        "name": "name_",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "symbol_",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "dst",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "transfer",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "src",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "dst",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "transferFrom",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "version",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
];

async function main() {
  // Initialize provider (updated for ethers v6+)
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const wethContract = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet);

  console.log('\n=== ETH to wETH Swapper ===');
  console.log(`Connected to: ${(await provider.getNetwork()).name}`);
  console.log(`Wallet address: ${wallet.address}`);

  // Helper function for user input
  const askQuestion = (query) => new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, ans => {
      rl.close();
      resolve(ans);
    });
  });

  try {
    // Get user input
    const iterations = await askQuestion('How many swaps would you like to perform? ');
    const customAmount = await askQuestion(`Enter amount per swap in ETH (default ${DEFAULT_AMOUNT}): `);
    
    const swapAmount = customAmount ? parseFloat(customAmount) : DEFAULT_AMOUNT;
    const numIterations = parseInt(iterations) || 1;
    
    console.log(`\nWill perform ${numIterations} swaps of ${swapAmount} ETH each`);

    // Execute swaps
    for (let i = 0; i < numIterations; i++) {
      console.log(`\n--- Swap ${i+1} of ${numIterations} ---`);
      
      try {
        const amountInWei = ethers.parseEther(swapAmount.toString());
        
        console.log(`Starting swap of ${swapAmount} ETH to wETH...`);
        
        // Check balances
        const balanceBefore = await provider.getBalance(wallet.address);
        console.log(`ETH balance before: ${ethers.formatEther(balanceBefore)} ETH`);
        
        const wethBalanceBefore = await wethContract.balanceOf(wallet.address);
        console.log(`wETH balance before: ${ethers.formatEther(wethBalanceBefore)} wETH`);

        // Execute swap
        const tx = await wethContract.deposit({ value: amountInWei });
        console.log(`Transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`Confirmed in block ${receipt.blockNumber}`);

        // Check new balances
        const balanceAfter = await provider.getBalance(wallet.address);
        console.log(`ETH balance after: ${ethers.formatEther(balanceAfter)} ETH`);
        
        const wethBalanceAfter = await wethContract.balanceOf(wallet.address);
        console.log(`wETH balance after: ${ethers.formatEther(wethBalanceAfter)} wETH`);

        // Wait between swaps if needed
        if (i < numIterations - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error in swap ${i+1}:`, error);
      }
    }
    
    console.log('\nAll operations completed');
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

main().catch(console.error);
