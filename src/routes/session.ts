import { Router } from 'express';
import { db } from '../lib/db';

const router = Router();

// 1. List all sessions
router.get('/list', (req, res) => {
    try {
        const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
        res.json(sessions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Get history for a specific session
router.get('/:id/history', (req, res) => {
    try {
        const { id } = req.params;

        // Step A: Find the session.
        // We check if 'id' matches the 'client_session_id' (UUID) OR the internal 'id' (Integer).
        let session = db.prepare('SELECT * FROM sessions WHERE client_session_id = ?').get(id) as any;

        // If not found by UUID, try finding by internal ID
        if (!session && !isNaN(Number(id))) {
            session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
        }

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        // Step B: Fetch messages from the correct table: 'messages'
        const messages = db.prepare(`
            SELECT role, content, created_at
            FROM messages
            WHERE session_id = ?
            ORDER BY created_at ASC
        `).all(session.id);

        res.json({
            session_id: session.client_session_id,
            provider_id: session.provider_id,
            messages: messages
        });

    } catch (error: any) {
        console.error("History Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
