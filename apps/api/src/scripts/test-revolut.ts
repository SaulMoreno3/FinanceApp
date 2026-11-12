import { revolutClient } from '../modules/crypto/services/revolut-client';
import { revolutConfig } from '../modules/crypto/config';

async function testConnection() {
    console.log('Testing Revolut X Crypto API Connection...');

    if (!revolutConfig.apiKey || !revolutConfig.privateKey) {
        console.error('Error: REVOLUT_API_KEY and REVOLUT_PRIVATE_KEY must be set in .env');
        return;
    }

    try {
        // Attempt to fetch accounts or a public endpoint
        // Using a common endpoint like /api/1.0/accounts or /api/1.0/orders
        // If we don't know a valid endpoint for sure, we can try to fetch the list of symbols
        // detailed documentation: https://developer.revolut.com/docs/crypto-exchange/
        // Assuming /api/1.0/instruments is a valid endpoint for public data, but we want to test AUTH.
        // Accounts endpoint is usually authenticated.

        console.log('Fetching accounts...');
        // Replace with a valid endpoint from the documentation if needed.
        // Based on standard Revolut API, /api/1.0/accounts is often used.
        // However, for Crypto Exchange it might be different.
        // The user provided prompt mentions /api/1.0/orders/active in the example.

        // Let's try to get account balance or similar if possible, or just a safe read-only endpoint.
        // The documentation mentions "browse the menu on the left", which I can't see.
        // I will try a safe guess: /api/retail/user/current or just check if I can sign a request.

        // Actually, let's try to just sign a request and print it,
        // and maybe try a request that is likely to fail with 404 but prove auth worked if it's not 401.

        // Better yet, let's try to fetch /api/1.0/account if it exists, or just catch the error and see if it's 401.
        // If it's 401, auth failed. If it's 404, auth might still be good.

        // Let's assume there is a /api/1.0/accounts endpoint for now.
        const path = '/api/1.0/accounts';
        const response = await revolutClient.get(path);
        console.log('Response:', response);

    } catch (error: any) {
        console.error('Request failed:', error.message);
        if (error.message.includes('401')) {
            console.error('Authentication failed. Please check your keys.');
        }
    }
}

testConnection();
