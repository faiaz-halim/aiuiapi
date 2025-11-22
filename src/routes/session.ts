import { Router } from 'express';
import db from '../lib/db';

const router = Router();

// Start a session (Browser launch triggers) - Optional now as Chat handles it
router.post('/start', (req, res) => {
    res.json({ message: "Use /chat endpoint to manage sessions automatically." });
});

// NEW: Get History for a specific session or all
router.get('/:id/history', (req, res) => {
    const sessionId = req.params.id;
    const history = db.prepare('SELECT * FROM history WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
    res.json(history);
});

// NEW: List all sessions
router.get('/list', (req, res) => {
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
    res.json(sessions);
});

export default router;
