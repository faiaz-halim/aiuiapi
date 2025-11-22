# Browser AI Gateway - Getting Started

This project turns any web-based LLM chat interface (ChatGPT, Mistral, Claude, etc.) into a programmable API. It supports standard OpenAI-compatible streaming, persistent history, and headless browsing.

## 📂 Project Structure

- **`src/index.ts`**: Main server entry point.
- **`src/lib/browser.ts`**: Core logic for Playwright automation (stealth mode, clicking, typing).
- **`src/routes/`**: API endpoints (Chat, Providers, History, OpenAI).
- **`data/`**: Stores SQLite database and browser profiles (cookies).

---

## 1. Installation & Setup

### Prerequisites
- Node.js (v18+)
- NPM

### Install
1. Install project dependencies:
   ```bash
   npm install
   ```

2. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

### Run Server
Start the API server. It will automatically initialize the SQLite database (`data/browser-ai.db`).

```bash
npx ts-node src/index.ts
```
*Server is now listening on `http://localhost:3000`*

---

## 2. Register a Provider

You need to tell the system how to interact with a specific website. You do this once per website.

**Example: Configuring "Mammouth" (Mistral Wrapper)**
Run this command in a separate terminal window:

```bash
curl -X POST http://localhost:3000/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mammouth",
    "base_url": "https://mammouth.ai/app/a/default",
    "login_url": "https://mammouth.ai/login",
    "selector_input": "[placeholder=\"Ask your question\"]",
    "selector_submit": "ENTER",
    "selector_response": "div[class*=\"message_content\"].mistral",
    "selector_new_chat": "a[href=\"/app/a/default\"]",
    "selector_model": "button:has-text(\"Mistral\")"
  }'
```

### Configuration Fields
| Field | Description |
| :--- | :--- |
| `name` | Unique ID to call this model (e.g., "GPT4", "Claude"). |
| `base_url` | The URL where the chat interface lives. |
| `login_url` | The login page URL (used by the login helper). |
| `selector_input` | CSS selector for the chat input box. |
| `selector_submit` | CSS selector for the send button, or `"ENTER"` to press the Enter key. |
| `selector_response`| CSS selector for the AI response bubbles. |
| `selector_new_chat`| (Optional) CSS selector to click to reset context. |
| `selector_model` | (Optional) CSS selector/text to ensure correct model is selected. |

---

## 3. Login (The "Human" Step)

Since these sites require authentication, you must log in manually **once**. The browser will save your cookies to `data/profiles/`.

1.  **Run the Login Helper:**
    ```bash
    npx ts-node src/login-helper.ts
    ```
2.  **Select the Provider** (e.g., Enter `1`).
3.  **Action:**
    - A Chrome window will appear.
    - Log in to the website normally.
    - Wait until you see the main chat interface.
    - **Close the browser window.**
    - Press `Ctrl+C` in your terminal to exit the helper.

---

## 4. Chatting

You have two ways to interact with the system.

### Option A: Internal API (Direct Control)
Good for testing and explicit control over headless/headful modes.

**1. Start New Chat (Headful - see it happen):**
```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "message": "Hello Neo.",
    "headless": false,
    "new_chat": true
  }'
```

**2. Continue Chat (Headless - background):**
```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "message": "What is the Matrix?",
    "headless": true,
    "new_chat": false
  }'
```

### Option B: OpenAI Compatible API
Standard format for integrating with tools like LangChain, AutoGen, or VS Code extensions.

**Endpoint:** `http://localhost:3000/v1/chat/completions`

```bash
curl -N -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Mammouth",
    "messages": [
      { "role": "user", "content": "Write a python script to reverse a string." }
    ],
    "stream": true,
    "headless": false
  }'
```
*Note: You can add `"headless": false` to the JSON body to watch the interaction, even though it's not part of the standard OpenAI spec.*

---

## 5. Managing History

All conversations are saved to the local SQLite database.

- **List All Sessions:**
  ```bash
  curl http://localhost:3000/session/list
  ```

- **Get Chat Log for Session #1:**
  ```bash
  curl http://localhost:3000/session/1/history
  ```

---

## 6. Debugging

If the bot isn't typing or reading responses, your CSS selectors might be outdated.

1.  **Run the Debugger:**
    ```bash
    npx ts-node src/debug-selector.ts
    ```
2.  **Action:**
    - This opens the browser.
    - It attempts to type a test message.
    - It **keeps the window open** so you can Right Click -> Inspect Element to fix your selectors.
