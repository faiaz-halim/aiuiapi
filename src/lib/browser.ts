import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { db } from './db';

chromium.use(stealth());

class BrowserService {
    private browserContexts: Map<number, BrowserContext> = new Map();
    private pages: Map<string, Page> = new Map();

    constructor() {
        // Ensure user data dir exists
        const userDataDir = path.join(process.cwd(), 'user_data');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }
    }

    private async getProvider(id: number) {
        return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any;
    }

    /**
     * Creates or retrieves a browser context with Stealth settings.
     * This is crucial for bypassing Google's "Secure App" checks.
     */
    private async getContext(providerId: number, headless: boolean = true): Promise<BrowserContext> {
        if (this.browserContexts.has(providerId)) {
            return this.browserContexts.get(providerId)!;
        }

        // Unique folder for this provider's cookies/localstorage
        const userDataDir = path.join(process.cwd(), 'user_data', `provider_${providerId}`);

        // === STEALTH LAUNCH CONFIGURATION === Local Chrome
        // const context = await chromium.launchPersistentContext(userDataDir, {
        //     headless: headless,
        //     channel: 'chrome', // Tries to use local Google Chrome (More trusted by Google)
        //     viewport: null,    // Allows window to resize naturally
        //     args: [
        //         '--disable-blink-features=AutomationControlled', // Hides "I am a robot" flag
        //         '--no-sandbox',
        //         '--disable-setuid-sandbox',
        //         '--disable-infobars',
        //         '--start-maximized',
        //     ],
        //     ignoreDefaultArgs: ['--enable-automation'], // Hides the "Chrome is being controlled" banner
        //     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        // });
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1280,720'
            ],
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const cookiePath = path.join(process.cwd(), 'data', 'cookies.json');
        if (fs.existsSync(cookiePath)) {
            console.log('[Browser] Loading cookies from JSON file...');
            const cookieData = fs.readFileSync(cookiePath, 'utf8');
            const cookies = JSON.parse(cookieData);
            await context.addCookies(cookies);
        }

        this.browserContexts.set(providerId, context);
        return context;
    }

    // === NEW: Helper for manual scripts (Login/Debug) ===
    public async launchPage(providerId: number, headless: boolean = false): Promise<Page> {
        // Force headless=false if you call this manually for debugging
        const context = await this.getContext(providerId, headless);

        // Return the first page if exists, or create new
        const pages = context.pages();
        if (pages.length > 0) return pages[0];

        return await context.newPage();
    }

    // === CORE: API Response Generator ===
    public async *generateResponse(sessionId: string, providerId: number, prompt: string, headless: boolean = true): AsyncGenerator<string, void, unknown> {
        const provider = await this.getProvider(providerId);
        if (!provider) throw new Error(`Provider ${providerId} not found`);

        const context = await this.getContext(providerId, headless);

        // Reuse page for session or create new
        let page = this.pages.get(sessionId);

        if (!page || page.isClosed()) {
            page = await context.newPage();
            this.pages.set(sessionId, page);

            try {
                console.log(`[Browser] Navigating to ${provider.base_url}`);
                await page.goto(provider.url || provider.base_url);

                // Attempt to wait for input. If fail, check login.
                try {
                    await page.waitForSelector(provider.selector_input, { timeout: 8000 });
                } catch (e) {
                    const url = page.url();
                    console.log(`[Browser] Input not found. Current URL: ${url}`);

                    if (url.includes('login') || url.includes('signin') || url.includes('auth')) {
                         throw new Error(`Browser is on login page (${url}). Please run 'npm run login' first.`);
                    }
                }
            } catch (err) {
                console.error(`[Browser] Error initializing page: ${err}`);
                throw err;
            }
        } else {
            await page.bringToFront();
        }

        // Input Prompt
        await page.waitForSelector(provider.selector_input);
        await page.fill(provider.selector_input, prompt);

        // === FIX: Handle "ENTER" as a keystroke, not a selector ===
        if (provider.selector_submit === 'ENTER') {
            await page.keyboard.press('Enter');
        } else if (provider.selector_submit) {
            // Only click if it's a real CSS selector
            await page.click(provider.selector_submit);
        } else {
            // Fallback default
            await page.keyboard.press('Enter');
        }

        // Wait for response container
        await page.waitForSelector(provider.selector_response);

        let lastText = "";
        let noChangeCount = 0;
        const maxNoChange = 30; // ~6 seconds of silence

        while (true) {
            await new Promise(r => setTimeout(r, 200));

            // Select all response bubbles
            const elements = await page.$$(provider.selector_response);
            if (elements.length === 0) continue;

            // Assuming the last bubble is the new answer
            const lastElement = elements[elements.length - 1];
            const currentText = await lastElement.innerText();

            if (currentText !== lastText) {
                // Yield only the new chunk
                const newContent = currentText.substring(lastText.length);
                lastText = currentText;
                noChangeCount = 0;
                if (newContent) yield newContent;
            } else {
                noChangeCount++;
                // If text hasn't changed for ~6 seconds, assume generation is done
                if (noChangeCount > maxNoChange) break;
            }
        }
    }
}

export const browserService = new BrowserService();
