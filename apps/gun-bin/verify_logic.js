import Gun from 'gun';
import 'gun/sea.js'; // Import directly to ensure it loads in Node
// Polyfill for SEA in Node if needed, usually 'gun' handles it but explicitly:
import SEA from 'gun/sea.js';

// Setup Gun with a file storage to ensure it persists ensuring logic works locally
const gun = Gun({
    file: 'radata',
    peers: [] // Local test only first
});

console.log("Starting Gun.js Verification...");

async function testGunLogic() {
    const content = "Test Content " + Date.now();
    const passphrase = "test-password";
    const pasteId = "test-" + Date.now(); // creating manual ID for easy finding

    console.log(`\n[1] Creating Paste with ID: ${pasteId}`);

    try {
        const dataToEncrypt = JSON.stringify({
            text: content,
            burn: false,
            exp: Date.now() + 1000 * 60 // 1 min
        });

        // 1. Encrypt
        const encrypted = await SEA.encrypt(dataToEncrypt, passphrase);
        console.log("   > Encryption successful.");
        // console.log("   > Encrypted length:", encrypted.length);

        // 2. Save
        await new Promise((resolve, reject) => {
            gun.get('pastes').get(pasteId).put({
                content: encrypted,
                timestamp: Date.now()
            }, (ack) => {
                if (ack.err) reject(ack.err);
                else resolve(ack);
            });
        });
        console.log("   > Saved to Gun graph.");

        // 3. Retrieve
        console.log(`\n[2] Retrieving Paste: ${pasteId}`);

        const data = await new Promise((resolve, reject) => {
            gun.get('pastes').get(pasteId).once((d) => {
                if (d && d.content) resolve(d);
                else reject(new Error("Data not found or empty"));
            });
        });
        console.log("   > Data found.");

        // 4. Decrypt
        const decryptedRaw = await SEA.decrypt(data.content, passphrase);
        if (!decryptedRaw) throw new Error("Decryption returned null");

        const decryptedData = JSON.parse(decryptedRaw);
        console.log(`   > Decrypted Content: "${decryptedData.text}"`);

        if (decryptedData.text === content) {
            console.log("\nSUCCESS: Input matches Output!");
        } else {
            console.error("\nFAILURE: Mismatch!");
        }

    } catch (err) {
        console.error("\nERROR during verification:", err);
    }

    // Clean up
    process.exit(0);
}

// Check if SEA is ready (sometimes needs a moment in Node)
setTimeout(testGunLogic, 1000);
