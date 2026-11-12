import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generates an Ed25519 key pair for Revolut X API authentication.
 * Saves the keys to 'private.pem' and 'public.pem' in the current directory.
 */
function generateKeys() {
    console.log('Generating Ed25519 key pair...');

    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    }) as any as { privateKey: string; publicKey: string };

    const outputDir = process.cwd();
    const privateKeyPath = path.join(outputDir, 'private.pem');
    const publicKeyPath = path.join(outputDir, 'public.pem');

    fs.writeFileSync(privateKeyPath, privateKey, {mode:0o600,flag:'wx'});
    fs.writeFileSync(publicKeyPath, publicKey, {mode:0o644,flag:'wx'});

    console.log(`\nKeys generated successfully!`);
    console.log(`Private Key saved to: ${privateKeyPath}`);
    console.log(`Public Key saved to: ${publicKeyPath}`);

    console.log('\n--- NEXT STEPS ---');
    console.log('1. Copy the content of public.pem and provide it to Revolut via the web app.');
    console.log('2. Add the private key content to your .env file as REVOLUT_PRIVATE_KEY.');
    console.log('   Note: You might need to replace newlines with \\n for the .env variable if using a single line string,');
    console.log('   or use a multi-line string compatible loader.');
}

generateKeys();
