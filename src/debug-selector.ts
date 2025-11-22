// src/debug-selector.ts
import { browserService } from './lib/browser';
import db from './lib/db';

(async () => {
    const providerId = 1;
    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as any;

    console.log('[Debug] Launching Browser...');
    await browserService.init(`provider_${provider.id}`, false); // Headless = false to see it
    await browserService.goto(provider.base_url);

    console.log('[Debug] Sending Test Message...');
    // We just type it, not submitting yet so you can see
    await browserService.sendMessage(
        provider.selector_input,
        provider.selector_submit,
        "Hello, what is the capital of France?"
    );

    console.log('\n==================================================');
    console.log('🔍 INSPECTION TIME');
    console.log('1. Right-click the AI\'s response bubble.');
    console.log('2. Select "Inspect" (or Inspect Element).');
    console.log('3. Look for a class name like "prose" or "message-content" or "group".');
    console.log('   (It is usually the DIV that wraps the actual text).');
    console.log('4. Copy that class/selector.');
    console.log('==================================================\n');

    // Keep open forever
    await new Promise(() => {});
})();
