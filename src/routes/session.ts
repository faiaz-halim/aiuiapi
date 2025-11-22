import { Router } from 'express';
import { requestLock } from '../lib/queue';
import { browserService } from '../lib/browser';
import db from '../lib/db';

const router = Router();

// POST /session/start
// Body: { provider_id: 1, headless: false }
router.post('/start', async (req, res) => {
    const { provider_id, headless } = req.body;
    
    // Default to "default" profile if no provider logic is set up yet
    // In the future, we can fetch the provider name from DB to name the folder
    const profileId = `provider_${provider_id || 'default'}`;
    const isHeadless = headless === undefined ? true : headless;

    // Acquire Lock (Wait if another request is active)
    await requestLock.runExclusive(async () => {
        try {
            // 1. Initialize Browser
            await browserService.init(profileId, isHeadless);
            
            // 2. Create Session Record in DB
            const stmt = db.prepare('INSERT INTO sessions (provider_id, is_active) VALUES (?, 1)');
            const info = stmt.run(provider_id || 0);

            res.json({
                success: true,
                session_id: info.lastInsertRowid,
                message: `Browser started for profile: ${profileId}`
            });

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// POST /session/stop
router.post('/stop', async (req, res) => {
    await requestLock.runExclusive(async () => {
        await browserService.close();
        res.json({ success: true, message: "Browser closed" });
    });
});

export default router;
