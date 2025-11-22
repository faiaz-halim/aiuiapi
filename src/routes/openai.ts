import { Router } from 'express';
import { requestLock } from '../lib/queue';
import { browserService } from '../lib/browser';
import db from '../lib/db';

const router = Router();

router.post('/chat/completions', async (req, res) => {
    // 1. Parse OpenAI-style body
    // Expected: { model: "Mammouth", messages: [ ... ], stream: true, ... }
    // We also allow custom properties: { headless: false, new_chat: true }
    const { model, messages, stream, headless, new_chat } = req.body;

    if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Invalid request. 'model' and 'messages' are required." });
    }

    // 2. Find Provider by Name (The 'model' field maps to Provider Name)
    const provider = db.prepare('SELECT * FROM providers WHERE name = ? COLLATE NOCASE').get(model) as any;

    if (!provider) {
        return res.status(404).json({
            error: `Model (Provider) '${model}' not found. Please register it via POST /providers first.`
        });
    }

    // 3. Extract the prompt (We only type the LAST message into the browser)
    // The browser keeps its own history visually, so we don't re-type previous context.
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage.content;

    // Headers for SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await requestLock.runExclusive(async () => {
        try {
            const profileId = `provider_${provider.id}`;
            // Default headless to true unless explicitly disabled in body
            const isHeadless = headless === undefined ? true : headless;

            // Init
            await browserService.init(profileId, isHeadless);
            await browserService.goto(provider.base_url, provider.selector_model);

            // Handle New Chat flag OR if it's the first message in the array
            // (Simple heuristic: if client sends only 1 message, treat as new chat)
            const shouldReset = new_chat !== undefined ? new_chat : (messages.length === 1);

            if (shouldReset && provider.selector_new_chat) {
                console.log(`[OpenAI] ${model}: Clicking New Chat...`);
                await browserService.click(provider.selector_new_chat);
                await new Promise(r => setTimeout(r, 1000));
            }

            // Count existing bubbles
            const prevCount = await browserService.getCount(provider.selector_response);

            // Send Message
            await browserService.sendMessage(
                provider.selector_input,
                provider.selector_submit,
                prompt
            );

            const created = Math.floor(Date.now() / 1000);
            const id = `chatcmpl-${created}`;

            // Stream Response using OpenAI Format
            await browserService.streamResponse(provider.selector_response, prevCount, (chunk) => {
                const payload = JSON.stringify({
                    id: id,
                    object: "chat.completion.chunk",
                    created: created,
                    model: model,
                    choices: [{
                        index: 0,
                        delta: { content: chunk },
                        finish_reason: null
                    }]
                });
                res.write(`data: ${payload}\n\n`);
            });

            // End Stream
            const donePayload = JSON.stringify({
                id: id,
                object: "chat.completion.chunk",
                created: created,
                model: model,
                choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: "stop"
                }]
            });
            res.write(`data: ${donePayload}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();

        } catch (error: any) {
            console.error('[OpenAI Error]', error);
            const errorPayload = JSON.stringify({ error: error.message });
            res.write(`data: ${errorPayload}\n\n`);
            res.end();
        }
    });
});

export default router;
