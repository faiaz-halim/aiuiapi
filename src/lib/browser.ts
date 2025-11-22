import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { Page, BrowserContext, Browser } from 'playwright';

// Apply stealth plugin to all chromium launches
chromium.use(stealth());

class BrowserService {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    // Track current state to decide if we need to restart
    private currentProfileId: string | null = null;
    private isHeadless: boolean = true;

    /**
     * Initializes or re-initializes the browser.
     * If the requested profile or headless mode differs from current,
     * it restarts the browser.
     */
    async init(profileId: string, headless: boolean = true) {
        const profilePath = path.join(__dirname, '../../data/profiles', profileId);

        // Ensure profile directory exists
        if (!fs.existsSync(profilePath)) {
            fs.mkdirSync(profilePath, { recursive: true });
        }

        // Check if we need to restart (Mode change or Profile change)
        const needsRestart =
            this.browser &&
            (this.currentProfileId !== profileId || this.isHeadless !== headless);

        if (needsRestart) {
            console.log('[Browser] Restarting due to config change...');
            await this.close();
        }

        // If already running and config matches, do nothing
        if (this.browser) {
            return;
        }

        console.log(`[Browser] Launching (Headless: ${headless}, Profile: ${profileId})...`);

        // Launch Persistent Context
        // Note: launchPersistentContext acts as both Browser and Context
        this.context = await chromium.launchPersistentContext(profilePath, {
            headless: headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled' // Extra stealth
            ],
            viewport: { width: 1280, height: 720 }
        });

        this.page = this.context.pages().length > 0
            ? this.context.pages()[0]
            : await this.context.newPage();

        this.browser = this.context as unknown as Browser; // Type casting for persistent context
        this.currentProfileId = profileId;
        this.isHeadless = headless;
    }

    async getPage(): Promise<Page> {
        if (!this.page) {
            throw new Error('Browser not initialized. Call init() first.');
        }
        return this.page;
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.browser = null;
            this.page = null;
            this.currentProfileId = null;
        }
    }

    /**
     * Navigates to the specific URL.
     * UPDATED: Accepts an optional selector to click immediately after loading (e.g. Model selection).
     */
    async goto(url: string, startupSelector?: string) {
        const page = await this.getPage();
        const currentUrl = page.url();

        // Only navigate if we aren't already there (preserves context/speed)
        if (!currentUrl.includes(url)) {
            console.log(`[Browser] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });

            // --- NEW LOGIC: Handle Startup Click ---
            if (startupSelector) {
                console.log(`[Browser] handling startup selector: ${startupSelector}`);
                try {
                    // Wait up to 5 seconds for the button to appear
                    await page.waitForSelector(startupSelector, { state: 'visible', timeout: 5000 });
                    await page.click(startupSelector);

                    // Give the site a second to react (e.g., load the specific model UI)
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.warn(`[Browser] Warning: Could not click startup selector '${startupSelector}'. It might be missing or already selected.`);
                }
            }
        }
    }

    /**
     * Types the prompt and clicks send.
     * UPDATED: Handles "ENTER" key submission.
     */
    async sendMessage(selectorInput: string, selectorSubmit: string, message: string) {
        const page = await this.getPage();

        console.log('[Browser] Waiting for input box...');
        await page.waitForSelector(selectorInput, { state: 'visible', timeout: 10000 });

        console.log('[Browser] Typing message...');
        // Focus first, just in case
        await page.click(selectorInput);
        await page.fill(selectorInput, message);

        console.log('[Browser] Sending...');

        // Small delay to simulate human behavior
        await page.waitForTimeout(500);

        // --- NEW LOGIC: Handle "ENTER" vs Click ---
        if (selectorSubmit === 'ENTER') {
            await page.keyboard.press('Enter');
        } else {
            await page.click(selectorSubmit);
        }

        // Reset focus or move mouse away (optional)
        await page.mouse.move(0, 0);
    }

    async getResponse(selectorResponse: string): Promise<string> {
        const page = await this.getPage();
        console.log('[Browser] Waiting for response to start...');

        // 1. Wait for at least one response element to appear
        try {
            await page.waitForSelector(selectorResponse, { state: 'visible', timeout: 15000 });
        } catch (e) {
            throw new Error(`Timeout waiting for selector "${selectorResponse}"`);
        }

        console.log('[Browser] Reading response stream...');

        let previousText = '';
        let currentText = '';
        let stableCount = 0;
        const maxRetries = 120; // Wait up to ~60 seconds for generation to finish

        // 2. Loop until the text stops changing (stream finished)
        for (let i = 0; i < maxRetries; i++) {
            await page.waitForTimeout(500);

            // Get all elements matching the selector (e.g., all chat bubbles)
            // We usually want the LAST one.
            const elements = await page.$$(selectorResponse);
            if (elements.length > 0) {
                const lastElement = elements[elements.length - 1];
                currentText = await lastElement.innerText();
            }

            // Check if text has changed since last check
            if (currentText && currentText === previousText && currentText.length > 0) {
                stableCount++;
                // If text hasn't changed for 3 checks (1.5 seconds), assume it's done
                if (stableCount >= 3) {
                    console.log('[Browser] Response generation finished.');
                    return currentText;
                }
            } else {
                stableCount = 0;
                previousText = currentText;
            }
        }

        return currentText; // Return whatever we have if it times out
    }

    /**
     * Polls the response element and calls the callback with NEW text chunks.
     */
    async streamResponse(selectorResponse: string, onChunk: (chunk: string) => void): Promise<string> {
        const page = await this.getPage();
        console.log('[Browser] Waiting for response stream...');

        try {
            // Wait for the element to exist
            await page.waitForSelector(selectorResponse, { state: 'visible', timeout: 30000 });
        } catch (e) {
            throw new Error(`Timeout waiting for selector "${selectorResponse}"`);
        }

        let previousText = '';
        let currentText = '';
        let stableCount = 0;
        const maxRetries = 240; // ~2 minutes max

        for (let i = 0; i < maxRetries; i++) {
            // Poll faster for streaming (100ms)
            await page.waitForTimeout(100);

            const elements = await page.$$(selectorResponse);
            if (elements.length > 0) {
                // Get the last message bubble
                const lastElement = elements[elements.length - 1];
                currentText = await lastElement.innerText();
            }

            // Calculate the new chunk
            if (currentText.length > previousText.length) {
                const newChunk = currentText.substring(previousText.length);
                onChunk(newChunk); // <--- SEND CHUNK TO CALLBACK
                previousText = currentText;
                stableCount = 0; // Reset stability because we saw movement
            }
            else if (currentText.length === previousText.length && currentText.length > 0) {
                stableCount++;
            }

            // If text hasn't changed for ~1 second (10 * 100ms), assume done
            if (stableCount >= 10) {
                console.log('[Browser] Stream finished.');
                break;
            }
        }

        return currentText;
    }
}

export const browserService = new BrowserService();
