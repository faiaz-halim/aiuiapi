// Create a temporary script: src/update-db.ts
import db from './lib/db';

try {
    db.exec(`ALTER TABLE providers ADD COLUMN selector_new_chat TEXT;`);
    console.log("✅ Added selector_new_chat column.");
} catch (e) {
    console.log("ℹ️ Column likely already exists.");
}
