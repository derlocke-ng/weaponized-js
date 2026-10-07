import Gun from 'gun';
import SEA from 'gun/sea.js'; // Explicit import

async function testCrypto() {
    console.log("Testing SEA Crypto Logic...");
    const pair = await SEA.pair();
    const text = "hello world";
    const data = { msg: text };
    const key = "super-secret";

    console.log("1. Encrypting...");
    try {
        const enc = await SEA.encrypt(data, key);
        console.log("Encrypted:", enc);

        console.log("2. Decrypting...");
        const dec = await SEA.decrypt(enc, key);
        console.log("Decrypted:", dec);

        if (dec.msg === text) {
            console.log("SUCCESS: Crypto works!");
        } else {
            console.error("FAILURE: Mismatch");
        }
    } catch (e) {
        console.error("ERROR:", e);
    }
}

testCrypto();
