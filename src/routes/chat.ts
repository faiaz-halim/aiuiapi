import { Router } from 'express';
import { requestLock } from '../lib/queue';
import { browserService } from '../lib/browser';
import db from '../lib/db';

const router = Router();

router.post('/', async (req, res) => {
    const { provider_id, message, headless, new_chat } = req.body;

    if (!provider_id || !message) {
        return res.status(400).json({ error: "provider_id and message are required" });
    }

    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(provider_id) as any;
    if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
    }

    // --- 1. SESSION MANAGEMENT ---
    // We need to know which "session" (conversation) this belongs to in OUR database
    let sessionId: number | bigint;

    if (new_chat) {
        // Create a new session entry
        const info = db.prepare('INSERT INTO sessions (provider_id) VALUES (?)').run(provider_id);
        sessionId = info.lastInsertRowid;
    } else {
        // Find the most recent session for this provider
        const lastSession = db.prepare('SELECT id FROM sessions WHERE provider_id = ? ORDER BY id DESC LIMIT 1').get(provider_id) as any;
        if (lastSession) {
            sessionId = lastSession.id;
        } else {
            // Fallback: Create one if none exists
            const info = db.prepare('INSERT INTO sessions (provider_id) VALUES (?)').run(provider_id);
            sessionId = info.lastInsertRowid;
        }
    }

    // --- 2. SAVE USER MESSAGE ---
    db.prepare('INSERT INTO history (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, 'user', message);

    // Setup SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await requestLock.runExclusive(async () => {
        try {
            const profileId = `provider_${provider.id}`;
            const isHeadless = headless === undefined ? true : headless;

            // Init & Navigate
            await browserService.init(profileId, isHeadless);
            await browserService.goto(provider.base_url, provider.selector_model);

            // Handle "New Chat" click if requested
            if (new_chat && provider.selector_new_chat) {
                console.log('[Chat] Clicking New Chat...');
                await browserService.click(provider.selector_new_chat);
                await new Promise(r => setTimeout(r, 1000)); // Buffer for UI reset
            }

            // Get Previous Count (Fix for sticky messages)
            const prevCount = await browserService.getCount(provider.selector_response);

            // Send Message
            await browserService.sendMessage(
                provider.selector_input,
                provider.selector_submit,
                message
            );

            // --- 3. STREAM & ACCUMULATE ---
            let fullResponse = "";

            await browserService.streamResponse(provider.selector_response, prevCount, (chunk) => {
                fullResponse += chunk; // Accumulate text for DB
                const payload = JSON.stringify({ content: chunk });
                res.write(`data: ${payload}\n\n`);
            });

            // --- 4. SAVE AI RESPONSE ---
            db.prepare('INSERT INTO history (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, 'assistant', fullResponse);

            res.write('data: [DONE]\n\n');
            res.end();

        } catch (error: any) {
            console.error('[Chat Error]', error);
            const errorPayload = JSON.stringify({ error: error.message });
            res.write(`data: ${errorPayload}\n\n`);
            res.end();
        }
    });
});

export default router;
