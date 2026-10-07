import Gun from 'gun';
import SEA from 'gun/sea.js';

async function repro() {
    console.log("Starting Repro...");
    const content = "Secret Message";
    const passphrase = "password";

    // 1. Prepare data (matches main.js)
    const dataToEncrypt = JSON.stringify({
        text: content,
        burn: false,
        exp: Date.now() + 60000
    });

    console.log("Data to encrypt (string):", dataToEncrypt);

    // 2. Encrypt
    const encrypted = await SEA.encrypt(dataToEncrypt, passphrase);
    console.log("Encrypted type:", typeof encrypted);
    console.log("Encrypted preview:", encrypted.slice(0, 50) + "...");

    // 3. Decrypt
    const decryptedRaw = await SEA.decrypt(encrypted, passphrase);
    console.log("Decrypted Raw type:", typeof decryptedRaw);
    console.log("Decrypted Raw:", decryptedRaw);

    // 4. Parse (Logic from my fix)
    let decryptedData;
    if (typeof decryptedRaw === 'string') {
        try {
            decryptedData = JSON.parse(decryptedRaw);
            console.log("Parsed JSON successfully.");
        } catch (e) {
            console.error("JSON Parse Error:", e.message);
        }
    } else {
        console.log("Handling as object/other...");
        decryptedData = decryptedRaw;
    }

    console.log("Final Data:", decryptedData);
}

repro();
