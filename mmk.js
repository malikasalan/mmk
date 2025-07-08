// Import library yang diperlukan
const { ethers } = require("ethers");
const dotenv = require("dotenv");
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

// Muat variabel dari file .env
dotenv.config();

// --- KONFIGURASI ---
// Alamat ini diambil dari log transaksi yang Anda berikan
const MOLTEN_TOKEN_ADDRESS = "0x66e535e8d2ebf13f49f3d49e5c50395a97c137b1"; // Token MOLTEN di Arbitrum
const MOLTEN_BRIDGE_CONTRACT_ADDRESS = "0x235000876bd58336C802B3546Fc0250f285fCc79"; // Kontrak Bridge Molten
const MOLTEN_DECIMALS = 18; // Asumsi desimal standar, harap verifikasi jika berbeda

// ABI (Application Binary Interface) Minimal untuk interaksi
// ABI untuk Token MOLTEN (Standar ERC20 untuk approve, allowance, balanceOf)
const MOLTEN_TOKEN_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

// ABI untuk Kontrak Bridge Molten (hanya fungsi yang kita perlukan)
const MOLTEN_BRIDGE_ABI = [
    "function depositERC20(uint256 amount)"
];


// Fungsi untuk bertanya kepada pengguna (menggunakan Promise)
function askQuestion(query) {
    return new Promise(resolve => readline.question(query, ans => {
        resolve(ans);
    }))
}

// Fungsi untuk jeda
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk mendapatkan provider dan signer
async function getProviderAndSigner(rpcUrl, privateKey) {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    if (!privateKey) {
        return { provider, signer: null };
    }
    try {
        const wallet = new ethers.Wallet(privateKey, provider);
        console.log(`Wallet berhasil dimuat: ${wallet.address}`);
        return { provider, signer: wallet };
    } catch (e) {
        console.error(`Kesalahan memuat wallet dari private key ${privateKey.substring(0,6)}...: ${e.message}`);
        return { provider, signer: null };
    }
}

// Fungsi untuk memeriksa dan melakukan approve MOLTEN
async function checkAndApproveMolten(signer, moltenTokenContract, amountWei) {
    const spenderAddress = MOLTEN_BRIDGE_CONTRACT_ADDRESS;
    try {
        const allowance = await moltenTokenContract.allowance(signer.address, spenderAddress);
        console.log(`Allowance MOLTEN saat ini untuk Bridge: ${ethers.utils.formatUnits(allowance, MOLTEN_DECIMALS)} MOLTEN`);

        if (allowance.lt(amountWei)) { // lt adalah "less than" untuk BigNumber
            console.log(`Allowance tidak cukup. Meminta persetujuan untuk ${ethers.utils.formatUnits(amountWei, MOLTEN_DECIMALS)} MOLTEN...`);
            const approveTx = await moltenTokenContract.connect(signer).approve(spenderAddress, amountWei, {
                gasLimit: 100000, // Estimasi gas untuk approve
            });
            console.log(`Transaksi approve dikirim, hash: ${approveTx.hash}. Menunggu konfirmasi...`);
            const receipt = await approveTx.wait();
            if (receipt.status === 1) {
                console.log("Approve berhasil!");
                return true;
            } else {
                console.error(`Transaksi approve gagal. Status receipt: ${receipt.status}`);
                return false;
            }
        } else {
            console.log("Allowance MOLTEN sudah cukup.");
            return true;
        }
    } catch (e) {
        console.error(`Kesalahan saat memeriksa atau melakukan approve: ${e.message}`);
        return false;
    }
}

// Fungsi untuk melakukan bridge token MOLTEN
async function bridgeMoltenTokens(signer, moltenTokenContract, moltenBridgeContract, amountToBridgeWei) {
    // 1. Lakukan Approve terlebih dahulu
    if (!await checkAndApproveMolten(signer, moltenTokenContract, amountToBridgeWei)) {
        console.log("Gagal melakukan approve. Proses bridge dibatalkan.");
        return false;
    }

    // 2. Lakukan deposit (bridge)
    try {
        console.log(`Mengirim transaksi bridge (depositERC20) untuk ${ethers.utils.formatUnits(amountToBridgeWei, MOLTEN_DECIMALS)} MOLTEN...`);
        const bridgeTx = await moltenBridgeContract.connect(signer).depositERC20(amountToBridgeWei, {
            gasLimit: 350000, // Gas limit dari transaksi Anda ~317k, kita beri sedikit lebih
        });
        console.log(`Transaksi bridge dikirim, hash: ${bridgeTx.hash}. Menunggu konfirmasi...`);
        const receipt = await bridgeTx.wait();
        if (receipt.status === 1) {
            console.log(`Bridge berhasil! Transaksi dikonfirmasi di blok: ${receipt.blockNumber}`);
            return true;
        } else {
            console.error(`Transaksi bridge gagal. Status receipt: ${receipt.status}, Gas used: ${receipt.gasUsed.toString()}`);
            return false;
        }
    } catch (e) {
        console.error(`Kesalahan saat mengirim transaksi bridge: ${e.message}`);
        if (e.data) console.error("Data Error:", e.data);
        return false;
    }
}


// Fungsi utama
async function main() {
    console.log("===== BOT AUTO BRIDGE MOLTEN (ARBITRUM ke MOLTEN) =====");
    console.log("PERINGATAN: Gunakan skrip ini dengan risiko Anda sendiri.");
    console.log("Pastikan Anda memahami cara kerja skrip dan telah mengamankan private key Anda.");
    console.log("Pastikan file .env sudah dikonfigurasi dengan benar (RPC, Private Keys).");
    console.log("=========================================================");

    let arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL;
    if (!arbitrumRpcUrl) {
        arbitrumRpcUrl = await askQuestion("Masukkan URL RPC Arbitrum Mainnet Anda: ");
    }

    let privateKeysStr = process.env.PRIVATE_KEYS_LIST;
    if (!privateKeysStr || privateKeysStr.trim() === "") {
        privateKeysStr = await askQuestion("Masukkan private key wallet (pisahkan dengan koma jika lebih dari satu): ");
    }
    const privateKeys = privateKeysStr.split(',').map(pk => pk.trim()).filter(pk => pk);

    if (privateKeys.length === 0) {
        console.log("Tidak ada private key yang dimasukkan. Keluar.");
        readline.close();
        return;
    }

    const numTxStr = await askQuestion("Berapa transaksi bridge yang ingin Anda lakukan per wallet? (default: 1): ") || "1";
    const numTransactionsPerWallet = parseInt(numTxStr);

    const amountMoltenStr = await askQuestion(`Berapa jumlah MOLTEN yang ingin Anda bridge per transaksi? (misal: 0.000142): `);
    const amountMoltenPerTx = parseFloat(amountMoltenStr);
    
    if (isNaN(numTransactionsPerWallet) || isNaN(amountMoltenPerTx) || amountMoltenPerTx <= 0) {
        console.error("Input tidak valid untuk jumlah transaksi atau jumlah MOLTEN.");
        readline.close();
        return;
    }
    const amountToBridgeWei = ethers.utils.parseUnits(amountMoltenPerTx.toString(), MOLTEN_DECIMALS);

    const delayTxStr = await askQuestion("Masukkan jeda waktu (detik) antar transaksi (default: 10): ") || "10";
    const delayBetweenTxSeconds = parseInt(delayTxStr);

    const delayWalletsStr = await askQuestion("Masukkan jeda waktu (detik) antar wallet (default: 30): ") || "30";
    const delayBetweenWalletsSeconds = parseInt(delayWalletsStr);

    for (let i = 0; i < privateKeys.length; i++) {
        const pkHex = privateKeys[i];
        console.log(`\n--- Memproses Wallet ke-${i + 1}/${privateKeys.length} (Alamat: ${new ethers.Wallet(pkHex).address}) ---`);
        
        const { provider, signer } = await getProviderAndSigner(arbitrumRpcUrl, pkHex);
        if (!signer) {
            console.error(`Gagal memuat wallet. Melanjutkan ke wallet berikutnya.`);
            continue;
        }

        const moltenTokenContract = new ethers.Contract(MOLTEN_TOKEN_ADDRESS, MOLTEN_TOKEN_ABI, provider);
        const moltenBridgeContract = new ethers.Contract(MOLTEN_BRIDGE_CONTRACT_ADDRESS, MOLTEN_BRIDGE_ABI, provider);

        // Cek saldo ETH dan MOLTEN
        try {
            const ethBalance = await signer.getBalance();
            const moltenBalance = await moltenTokenContract.balanceOf(signer.address);
            console.log(`Saldo saat ini: ${ethers.utils.formatEther(ethBalance)} ETH | ${ethers.utils.formatUnits(moltenBalance, MOLTEN_DECIMALS)} MOLTEN`);

            const requiredMoltenTotal = amountToBridgeWei.mul(numTransactionsPerWallet);
            if (moltenBalance.lt(requiredMoltenTotal)) {
                 console.warn(`PERINGATAN: Saldo MOLTEN tidak cukup untuk ${numTransactionsPerWallet} transaksi.`);
                 const proceed = await askQuestion("Lanjutkan dengan wallet ini (y/n)? ");
                 if (proceed.toLowerCase() !== 'y') continue;
            }
        } catch (e) {
            console.error(`Gagal memeriksa saldo: ${e.message}`);
        }
            
        for (let txNum = 0; txNum < numTransactionsPerWallet; txNum++) {
            console.log(`\nMemulai transaksi ke-${txNum + 1}/${numTransactionsPerWallet} untuk wallet ${signer.address}`);
            
            const success = await bridgeMoltenTokens(signer, moltenTokenContract, moltenBridgeContract, amountToBridgeWei);
            if (success) {
                console.log(`Transaksi ke-${txNum + 1} BERHASIL.`);
            } else {
                console.error(`Transaksi ke-${txNum + 1} GAGAL.`);
            }
            
            if (txNum < numTransactionsPerWallet - 1) { 
                console.log(`Menunggu ${delayBetweenTxSeconds} detik sebelum transaksi berikutnya...`);
                await sleep(delayBetweenTxSeconds * 1000);
            }
        }
        
        if (i < privateKeys.length - 1) { 
            console.log(`Menunggu ${delayBetweenWalletsSeconds} detik sebelum beralih ke wallet berikutnya...`);
            await sleep(delayBetweenWalletsSeconds * 1000);
        }
    }

    console.log("\n--- Semua proses bridge telah selesai ---");
    readline.close();
}

main().catch(error => {
    console.error("Terjadi kesalahan fatal:", error);
    readline.close();
    process.exit(1);
});
