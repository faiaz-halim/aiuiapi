import { browserService } from './lib/browser';
import { db } from './lib/db';

(async () => {
    const providerId = 1;
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as any;

    console.log('[Debug] Launching Browser...');
    // NEW WAY: Get raw page
    const page = await browserService.launchPage(providerId, false);

    await page.goto(provider.base_url || provider.url);

    console.log('[Debug] Sending Test Message...');

    try {
        // Wait for input to be visible
        await page.waitForSelector(provider.selector_input, { timeout: 5000 });

        // Type the message
        await page.fill(provider.selector_input, "Hello, what is the capital of France?");

        console.log('[Debug] Message typed (not sent).');
    } catch (error) {
        console.error("Could not find input selector. Are you logged in?");
    }

    console.log('\n==================================================');
    console.log('🔍 INSPECTION TIME');
    console.log('1. Right-click the AI\'s response bubble (if you manually send).');
    console.log('2. Select "Inspect" (or Inspect Element).');
    console.log('3. Update your database "selector_response" field with the correct class/ID.');
    console.log('==================================================\n');

    // Keep open forever
    await new Promise(() => {});
})();
