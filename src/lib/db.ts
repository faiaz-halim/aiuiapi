import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 1. Setup Data Directory
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 2. Initialize Database
// This creates 'data/db.sqlite' relative to your project root
const dbPath = path.join(dataDir, 'db.sqlite');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Better performance

// 3. Define Schema
const schema = `
    CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        login_url TEXT,
        base_url TEXT,
        selector_input TEXT,
        selector_submit TEXT,
        selector_response TEXT,
        selector_new_chat TEXT,
        selector_model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        client_session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider_id, client_session_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        role TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
`;

// Run schema creation immediately
db.exec(schema);

// 4. Helper Class for Business Logic
export class DB {
    /**
     * Retrieves an existing session or creates a new one mapping the
     * client's session_id to our internal DB id.
     */
    static getOrCreateSession(providerId: number, clientSessionId: string) {
        // Ensure clientSessionId is a string to prevent SQL errors
        const safeSessionId = clientSessionId ? String(clientSessionId) : 'default';

        const getStmt = db.prepare('SELECT * FROM sessions WHERE provider_id = ? AND client_session_id = ?');
        let session = getStmt.get(providerId, safeSessionId) as any;

        if (!session) {
            const insertStmt = db.prepare('INSERT INTO sessions (provider_id, client_session_id) VALUES (?, ?)');
            const result = insertStmt.run(providerId, safeSessionId);
            session = { id: result.lastInsertRowid, provider_id: providerId, client_session_id: safeSessionId };
        }

        return session;
    }

    /**
     * Logs a message to the database history
     */
    static addMessage(sessionId: number, role: 'user' | 'assistant', content: string) {
        const stmt = db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)');
        stmt.run(sessionId, role, content);
    }

    /**
     * Returns chat history for context (limit to last N messages)
     */
    static getHistory(sessionId: number, limit: number = 10) {
        return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
            .all(sessionId, limit)
            .reverse();
    }
}

export default db;
