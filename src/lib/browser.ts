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
    private currentProfileId: string | null = null;
    private isHeadless: boolean = true;

    async init(profileId: string, headless: boolean = true) {
        const profilePath = path.join(__dirname, '../../data/profiles', profileId);

        if (!fs.existsSync(profilePath)) {
            fs.mkdirSync(profilePath, { recursive: true });
        }

        const needsRestart =
            this.browser &&
            (this.currentProfileId !== profileId || this.isHeadless !== headless);

        if (needsRestart) {
            await this.close();
        }

        if (this.browser) return;

        console.log(`[Browser] Launching (Headless: ${headless}, Profile: ${profileId})...`);

        this.context = await chromium.launchPersistentContext(profilePath, {
            headless: headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ],
            viewport: { width: 1280, height: 720 }
        });

        this.page = this.context.pages().length > 0
            ? this.context.pages()[0]
            : await this.context.newPage();

        this.browser = this.context as unknown as Browser;
        this.currentProfileId = profileId;
        this.isHeadless = headless;
    }

    async getPage(): Promise<Page> {
        if (!this.page) throw new Error('Browser not initialized');
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

    async click(selector: string) {
        const page = await this.getPage();
        try {
            await page.waitForSelector(selector, { state: 'visible', timeout: 3000 });
            await page.click(selector);
        } catch (e) {
            console.warn(`[Browser] Click failed for ${selector}`);
        }
    }

    async goto(url: string, startupSelector?: string) {
        const page = await this.getPage();
        if (!page.url().includes(url)) {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
        }
        if (startupSelector) {
            try {
                await page.waitForSelector(startupSelector, { state: 'visible', timeout: 5000 });
                await page.click(startupSelector);
            } catch (e) { /* ignore */ }
        }
    }

    // --- NEW HELPER ---
    async getCount(selector: string): Promise<number> {
        const page = await this.getPage();
        return await page.$$eval(selector, els => els.length);
    }

    async sendMessage(selectorInput: string, selectorSubmit: string, message: string) {
        const page = await this.getPage();
        await page.waitForSelector(selectorInput, { state: 'visible' });
        await page.click(selectorInput);
        await page.fill(selectorInput, message);
        await page.waitForTimeout(500);

        if (selectorSubmit === 'ENTER') {
            await page.keyboard.press('Enter');
        } else {
            await page.click(selectorSubmit);
        }
        await page.mouse.move(0, 0);
    }

    // --- UPDATED STREAM RESPONSE ---
    // Now accepts 'startCount' to ensure we are reading the NEW bubble, not the old one.
    async streamResponse(selectorResponse: string, startCount: number, onChunk: (chunk: string) => void): Promise<string> {
        const page = await this.getPage();
        console.log(`[Browser] Waiting for response bubble (Previous count: ${startCount})...`);

        try {
            // Wait specifically for the element count to INCREASE
            await page.waitForFunction(
                ({ selector, count }) => document.querySelectorAll(selector).length > count,
                { selector: selectorResponse, count: startCount },
                { timeout: 30000 }
            );
        } catch (e) {
            throw new Error(`Timeout: New response bubble not found.`);
        }

        let previousText = '';
        let currentText = '';
        let stableCount = 0;

        // Max wait ~30s (300 * 100ms)
        for (let i = 0; i < 300; i++) {
            await page.waitForTimeout(100);

            const elements = await page.$$(selectorResponse);
            // Always grab the LAST element
            const lastElement = elements[elements.length - 1];

            currentText = await lastElement.innerText();

            if (currentText.length > previousText.length) {
                const newChunk = currentText.substring(previousText.length);
                onChunk(newChunk);
                previousText = currentText;
                stableCount = 0;
            } else {
                stableCount++;
            }

            // If no text change for 2 seconds, assume done
            if (stableCount > 20 && currentText.length > 0) {
                break;
            }
        }
        return currentText;
    }
}

export const browserService = new BrowserService();
