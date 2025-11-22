// src/login-helper.ts
import { browserService } from './lib/browser';
import db from './lib/db';

(async () => {
    const providerId = 1; // Change this if your provider ID is different

    console.log(`[Login Helper] Fetching config for Provider ${providerId}...`);
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as any;

    if (!provider) {
        console.error('Provider not found');
        process.exit(1);
    }

    console.log('[Login Helper] Launching Browser...');
    // We use the EXACT same profile ID as the chat route: "provider_1"
    await browserService.init(`provider_${provider.id}`, false);

    console.log(`[Login Helper] Navigating to: ${provider.login_url}`);
    await browserService.goto(provider.login_url);

    console.log('\n==================================================');
    console.log('ACTION REQUIRED:');
    console.log('1. The browser is now open.');
    console.log('2. Please LOG IN manually in that window.');
    console.log('3. Once you see the chat interface, you can close the browser.');
    console.log('4. Then press CTRL+C here to exit.');
    console.log('==================================================\n');

    // Keep script running forever until user kills it
    await new Promise(() => {});
})();
