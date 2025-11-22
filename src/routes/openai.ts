import { Router } from 'express';
import { browserService } from '../lib/browser';
import { DB } from '../lib/db';
import { randomUUID } from 'crypto'; // <--- IMPORT THIS

const router = Router();

router.post('/chat/completions', async (req, res) => {
  const { messages, model, stream, session_id, headless } = req.body;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return res.status(400).json({ error: "Last message must be from user" });
  }

  // 1. Get or Create Session
  const PROVIDER_ID = 1;

  // FIX: Generate a UUID if the client didn't send one
  const clientSessionId = session_id || randomUUID();

  const session = DB.getOrCreateSession(PROVIDER_ID, clientSessionId);

  // 2. Save User Message
  DB.addMessage(session.id, 'user', lastMessage.content);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullResponse = "";

  try {
    // Pass the resolved client_session_id (which is now definitely a UUID or user-provided string)
    const generator = await browserService.generateResponse(
      session.client_session_id,
      PROVIDER_ID,
      lastMessage.content,
      headless !== false
    );

    for await (const chunk of generator) {
      fullResponse += chunk;
      const sseChunk = {
        id: session.client_session_id, // This will now be the UUID
        object: "chat.completion.chunk",
        created: Date.now(),
        model: model || "browser-model",
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
      };
      res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      id: session.client_session_id,
      object: "chat.completion.chunk",
      created: Date.now(),
      model: model,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    })}\n\n`);

    res.write('data: [DONE]\n\n');

  } catch (error: any) {
    console.error("Streaming error:", error);
    const errorChunk = { error: { message: error.message || "Internal Server Error" } };
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
  } finally {
    if (fullResponse.trim().length > 0) {
      DB.addMessage(session.id, 'assistant', fullResponse);
    }
    res.end();
  }
});

export default router;
