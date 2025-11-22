import { Router } from 'express';
import { browserService } from '../lib/browser';
import { DB } from '../lib/db';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { message, session_id, stream, headless } = req.body;
    const PROVIDER_ID = 1; // Default to provider 1, or pass in body

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // 1. Get or Create Session
    const session = DB.getOrCreateSession(PROVIDER_ID, session_id);

    // 2. Save User Message
    DB.addMessage(session.id, 'user', message);

    // 3. Setup Response Headers
    res.setHeader('Content-Type', 'text/plain');
    if (stream) {
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    let fullResponse = "";

    try {
      // 4. Generate Response using the updated Service
      const generator = await browserService.generateResponse(
        session.client_session_id,
        PROVIDER_ID,
        message,
        headless !== false
      );

      for await (const chunk of generator) {
        fullResponse += chunk;
        res.write(chunk);
      }

    } catch (err: any) {
      console.error("Generation error:", err);
      res.write(`\n[Error: ${err.message}]`);
    } finally {
      // 5. Save Assistant Response to DB
      if (fullResponse.trim().length > 0) {
        DB.addMessage(session.id, 'assistant', fullResponse);
      }
      res.end();
    }

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
