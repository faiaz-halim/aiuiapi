import { Router } from 'express';
import db from '../lib/db';

const router = Router();

// GET /providers - List all configured providers
router.get('/', (req, res) => {
    const stmt = db.prepare('SELECT * FROM providers');
    res.json(stmt.all());
});

// POST /providers - Create or Update a provider
router.post('/', (req, res) => {
    const { name, base_url, login_url, selector_input, selector_submit, selector_response } = req.body;

    try {
        const stmt = db.prepare(`
            INSERT INTO providers (name, base_url, login_url, selector_input, selector_submit, selector_response)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(name, base_url, login_url, selector_input, selector_submit, selector_response);
        res.json({ success: true, id: info.lastInsertRowid });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
