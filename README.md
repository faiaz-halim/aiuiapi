# Browser AI Gateway - Complete Guide

This project turns any web-based LLM chat interface (ChatGPT, Mistral, Claude, etc.) into a programmable API. It supports standard OpenAI-compatible streaming, persistent history, and headless browsing.

## 📂 Project Structure

- **`src/index.ts`**: Main server entry point.
- **`src/lib/browser.ts`**: Core logic for Playwright automation.
- **`data/`**: Stores SQLite database and browser profiles (cookies).
- **`docker-compose.yml`**: Container orchestration.

---

## 1. Installation & Setup

### Option A: Docker (Recommended for Usage)

1.  **Build and Start:**
    ```bash
    docker compose up -d --build
    ```
2.  **View Logs:**
    ```bash
    docker compose logs -f
    ```

### Option B: Local Node.js (Recommended for Development)

1.  **Install Dependencies:**
    ```bash
    npm install
    npx playwright install chromium
    ```
2.  **Start Server:**
    ```bash
    npx ts-node src/index.ts
    ```

*Server listens on `http://localhost:3000`*

---

## 2. Configuration (One-Time Setup)

### Step 1: Register a Provider
You must tell the system how to interact with a specific website via a POST request.

**Example: Configuring "Mammouth" (Mistral Wrapper)**
```bash
curl -X POST http://localhost:3000/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mammouth",
    "base_url": "https://mammouth.ai/app/a/default",
    "login_url": "https://mammouth.ai/login",
    "selector_input": "[placeholder=\"Ask your question\"]",
    "selector_submit": "ENTER",
    "selector_response": "div[class*=\"message_content\"]",
    "selector_new_chat": "a[href=\"/app/a/default\"]",
    "selector_model": "button:has-text(\"Mistral\")"
  }'
```

### Step 2: Authentication (The "Human" Step)
Since you cannot solve CAPTCHAs in Docker easily, you must log in via your host machine once. The cookies are shared via the `./data` volume.

1.  **Stop Docker** (if running): `docker compose down`
2.  **Run Helper:** `npx ts-node src/login-helper.ts`
3.  **Action:** Select provider ID (e.g., 1). A browser opens. Log in manually. Close the window.
4.  **Restart Docker:** `docker compose up -d`

---

## 3. Usage Examples

### Type A: OpenAI Compatible API (Standard)
Best for integrating with existing tools (LangChain, AutoGen, VS Code extensions).

#### 1. cURL (OpenAI Format)
```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Mammouth",
    "messages": [
      { "role": "user", "content": "Explain quantum physics in one sentence." }
    ],
    "stream": true
  }'
```

Continue local session (If interval is too long it will open new chat)

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Mammouth",
    "session_id": "ad04b4db-f5be-42ec-aaed-067da2e9f50b",
    "messages": [
      { "role": "user", "content": "Explain quantum superposition in one sentence." }
    ],
    "stream": true
  }'
```

#### 2. Python (using official `openai` library)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="Mammouth", # Must match the "name" used in Step 1
    messages=[{"role": "user", "content": "Write a haiku about coding."}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

#### 3. Node.js (using official `openai` library)
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'dummy',
});

async function main() {
  const stream = await client.chat.completions.create({
    model: 'Mammouth',
    messages: [{ role: 'user', content: 'Hello world in C++' }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();
```

---

### Type B: Native API (Direct Control)
Best for debugging or if you need specific browser control flags (like toggling headless mode per request).

#### 1. Start New Chat (Streaming)
```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "message": "Hello!",
    "headless": true,
    "new_chat": true
  }'
```

#### 2. Continue Conversation (Keep Context)
Setting `new_chat: false` keeps the current browser tab active.
```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "message": "Tell me more about that.",
    "headless": true,
    "new_chat": false
  }'
```

#### 3. Debug Mode (Watch the Browser)
Set `headless: false` to see the browser pop up (works best on Local Node.js, not Docker).
```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "message": "Draw an ASCII cat.",
    "headless": false,
    "new_chat": true
  }'
```

---

## 4. Managing History

All interactions are saved to the internal SQLite database.

**1. List All Sessions**
```bash
curl http://localhost:3000/session/list
```

**2. Get Specific Chat Log**
```bash
# Replace '1' with the actual session ID
curl http://localhost:3000/session/1/history
```

**3. Delete a Session**
```bash
curl -X DELETE http://localhost:3000/session/1
```


---

## 5. Troubleshooting

### "Browser Closed" in Docker?
Docker runs in `headless` mode by default. If the website detects headless browsers (stealth failure):
1.  Ensure you are using the `puppeteer-extra-plugin-stealth` (included in this project).
2.  Try refreshing your cookies by running `src/login-helper.ts` on your host machine again.

### Database Locked?
If you switch between Docker and Local Node.js frequently, ensure the other process is fully stopped. SQLite files don't like being accessed by two systems simultaneously.
