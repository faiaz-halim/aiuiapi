Project Architecture & Implementation Plan
1. Architecture Overview
The system is a Node.js/TypeScript Application acting as a bridge between an OpenAI-compatible API request and a generic web browser.
Key Components:

API Layer (Express.js):

Receives POST /v1/chat/completions.
Handles Streaming (SSE).
Manages the global Request Mutex (ensures strict sequential execution).


Orchestration Layer (Controller):

Session Manager: Resolves which persistent browser profile to use based on the Provider ID.
Training Manager: Handles the recording of DOM selectors for new websites.
Chat Handler: Executes the "Go to URL -> Type -> Click -> Wait" loop.


Browser Layer (Playwright + Stealth):

Persistent Context: Each provider has a dedicated filesystem folder (./data/profiles/<id>) to store cookies, local storage, and login states.
DOM Observer: A custom client-side script injected into the browser to detect text generation in real-time and send it back to Node.js.


Data Layer (SQLite):

Stores Provider configurations (selectors).
Stores Chat History (for context injection).
Stores Session state (Last URL visited to resume conversations).




2. Database Schema
We will use better-sqlite3.
Table: providers
Defines how to interact with a specific website.

id (PK)
name (Text) - e.g., "ChatGPT", "Claude"
base_url (Text) - e.g., "https://chatgpt.com"
login_url (Text) - URL to redirect to if not logged in.
selector_input (Text) - CSS selector for the textarea.
selector_submit (Text) - CSS selector for the send button.
selector_response_container (Text) - CSS selector for the parent container of message bubbles.
selector_new_chat (Text) - CSS selector or URL to reset context.

Table: sessions
Tracks the state of a user's interaction with a provider.

id (PK)
provider_id (FK)
last_visited_url (Text) - Used to resume the specific thread (e.g., .../c/uuid).
is_active (Boolean)

Table: messages
Local history for context window construction.

id (PK)
session_id (FK)
role (Text) - 'user', 'assistant', 'system'
content (Text)
tool_calls (JSON Text) - If we detected a file operation.
created_at (Timestamp)


3. Detailed Task Breakdown
Phase 1: Project Initialization & Core Infrastructure

1.1 Project Scaffold
Initialize package.json.
Configure TypeScript (tsconfig.json).
Set up directory structure (src/, data/, scripts/).


1.2 Database Layer
Implement src/lib/db.ts (Singleton connection).
Write src/lib/schema.sql to create tables if they don't exist.


1.3 Global Mutex
Implement a Request Queue/Mutex service to ensure if the user sends 3 cURL requests, they process one by one.



Phase 2: Browser Engine (The "Hand")

2.1 Browser Service Class
Implement launchBrowser(profilePath, headlessMode).
Configure puppeteer-extra-plugin-stealth with Playwright to pass bot detection.


2.2 Session Persistence Logic
Ensure userDataDir is correctly mapped to ./data/profiles/<provider_name>.
Test: Login manually, close app, reopen app -> Should still be logged in.



Phase 3: The "Trainer" (Configuration Mode)

3.1 Training API
Endpoint POST /train/start: Opens browser in Headful mode to the target URL.


3.2 Inspector Script
Develop a client-side JS script that highlights DOM elements under the mouse.
On click, it should capture the unique CSS selector and console.log it (or send to a bound Node function).


3.3 Save Configuration
Endpoint POST /train/save: User validates the selectors (Input, Submit, Response) and saves to providers table.



Phase 4: The Chat Execution Loop

4.1 Context Loading
Check Request Headers for x-new-chat.
If false, load last_visited_url from DB. If true, load base_url.


4.2 Interaction Logic
Wait for selector_input.
Inject User Message.
Click selector_submit.


4.3 The DOM Listener (Critical)
Inject MutationObserver script.
Logic: Watch selector_response_container for the last child element.
Logic: Stream text content changes of that last child to Node.js.



Phase 5: Streaming & Parsing

5.1 SSE Bridge
Create an Express route that sets Content-Type: text/event-stream.
Convert incoming browser text chunks into OpenAI formatted JSON chunks (data: { choices: [...] }).


5.2 Tool/Code Detection
Accumulate the full response in a buffer variable.
On stream end, run Regex to find ``` blocks.
If the prompt contained keywords ("save", "create file") AND a code block exists, format the final saved message as a "Tool Call".



Phase 6: Client API & Integration

6.1 API Endpoint
POST /v1/chat/completions.
Accept standard OpenAI body (messages, model - where model maps to our Provider ID).


6.2 Context Injection
Retrieve last 5-10 messages from messages table.
Concatenate them into a single text block to paste into the web UI (since web UIs handle context themselves, we only need to paste the new prompt, but if we are starting a new chat session, we might want to paste a summary). Decision: Rely on Web UI's native context for existing sessions. Only paste the user's latest prompt.