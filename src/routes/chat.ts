import { Router } from 'express';
import { requestLock } from '../lib/queue';
import { browserService } from '../lib/browser';
import db from '../lib/db';

const router = Router();

router.post('/', async (req, res) => {
    const { provider_id, message, headless } = req.body;

    if (!provider_id || !message) {
        return res.status(400).json({ error: "provider_id and message are required" });
    }

    const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(provider_id) as any;
    if (!provider) {
        return res.status(404).json({ error: "Provider not found" });
    }

    // 1. SETUP SSE HEADERS
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush headers immediately

    await requestLock.runExclusive(async () => {
        try {
            // Init & Navigate
            const profileId = `provider_${provider.id}`;
            await browserService.init(profileId, headless ?? true);
            await browserService.goto(provider.base_url, provider.selector_model);

            // Send Message
            await browserService.sendMessage(
                provider.selector_input,
                provider.selector_submit,
                message
            );

            // 2. STREAM RESPONSE
            await browserService.streamResponse(provider.selector_response, (chunk) => {
                // Send data in OpenAI compatible format: data: {...} \n\n
                const payload = JSON.stringify({ content: chunk });
                res.write(`data: ${payload}\n\n`);
            });

            // 3. END STREAM
            res.write('data: [DONE]\n\n');
            res.end();

        } catch (error: any) {
            console.error(error);
            const errorPayload = JSON.stringify({ error: error.message });
            res.write(`data: ${errorPayload}\n\n`);
            res.end();
        }
    });
});

export default router;
