import { browserService } from './lib/browser';
import { db } from './lib/db';
import fs from 'fs';
import path from 'path';

(async () => {
    const providerId = 1;

    console.log(`[Login Helper] Fetching config for Provider ${providerId}...`);
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as any;

    if (!provider) {
        console.error('Provider not found');
        process.exit(1);
    }

    console.log('[Login Helper] Launching Browser...');
    const page = await browserService.launchPage(providerId, false); // headless = false

    console.log(`[Login Helper] Navigating to: ${provider.login_url}`);
    await page.goto(provider.login_url);

    console.log('\n==================================================');
    console.log('ACTION REQUIRED:');
    console.log('1. The browser is now open.');
    console.log('2. Please LOG IN manually in that window.');
    console.log('3. Wait until the main chat interface loads.');
    console.log('4. ⚠️  COME BACK HERE AND PRESS ENTER TO SAVE COOKIES & EXIT.');
    console.log('==================================================\n');

    // Wait for user to press Enter in terminal
    await new Promise(resolve => process.stdin.once('data', resolve));

    console.log('[Login Helper] Saving cookies to JSON...');

    // Get cookies from current context
    const cookies = await page.context().cookies();

    // Save to data/cookies.json
    const cookiePath = path.join(process.cwd(), 'data', 'cookies.json');
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));

    console.log(`✅ Cookies successfully saved to: ${cookiePath}`);
    console.log('You can now close the browser and run Docker.');

    await page.context().close();
    process.exit(0);
})();
