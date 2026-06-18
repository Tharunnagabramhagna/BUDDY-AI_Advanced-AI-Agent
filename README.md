# Buddy AI

![Electron](https://img.shields.io/badge/Electron-34-47848F?style=flat&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?style=flat&logo=tailwindcss&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-24-40B5A4?style=flat&logo=puppeteer&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-qwen3.5:2b-000000?style=flat&logo=ollama&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat&logo=python&logoColor=white)

> A desktop AI agent that automates browser tasks — shopping, food ordering, app launching, and general queries — from a single keyboard shortcut.

---

## What It Does

Buddy AI is a Windows desktop application built with Electron and React. It sits in the system tray and listens for a wake word or a global hotkey (`Ctrl+Alt+B`). Once active, it takes natural language input — typed or spoken — interprets the intent, and either answers locally, hands off to a local LLM, or launches a Puppeteer-controlled Chrome session to carry out the task.

The agent is approval-gated: before executing any browser action, it shows an approval card so the user can confirm (or cancel) with a budget cap on shopping tasks.

---

## Key Features

**Implemented and working:**

- **Global hotkey** (`Ctrl+Alt+B`) — show/hide from anywhere; also accessible from the system tray
- **Wake word activation** — say "Hey Buddy" (or "Hi Buddy", "Hello Buddy") to open the app hands-free
- **Voice input (STT)** — Python speech_recognition server with Google STT; always-on mic with two modes: wake-word-only (app hidden) and full command mode (app visible)
- **Local LLM chat** — uses Ollama with `qwen3.5:2b` running locally on port 11434; no cloud dependency for AI responses
- **Inline calculator** — math expressions answered instantly without hitting the LLM
- **Local response library** — greetings, farewells, small-talk handled without LLM latency
- **Amazon.in automation** — search by query + optional budget cap, ranked results displayed as an approval card (up to 5 options within budget, sorted by proximity to budget and rating), add to cart, and partial checkout flow
- **Flipkart automation** — product search, navigate to product page, add to cart
- **Zomato / Swiggy automation** — open restaurant page, scroll to menu, click Add, navigate to cart
- **Ola cab booking** — open booking page, pre-fill destination
- **App launching** — open Chrome, VS Code, Notepad, Spotify, Discord, and other installed Windows apps
- **Google / YouTube search** — direct search navigation in controlled Chrome session
- **Session history** — chat sessions persisted to `userData/history.json` via Electron's `app.getPath('userData')`
- **Multi-session sidebar** — switch between chat sessions without losing context

**Partially implemented:**

- Checkout / payment flow on Amazon (cart → checkout → COD/UPI/CARD selection → place order) — wired but brittle; depends on Amazon's checkout DOM being stable
- BookMyShow search — navigates to search URL and scrolls; does not select or book
- Swiggy add-to-cart — same flow as Zomato but Swiggy's DOM diffs can break selector matching

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 34 |
| Frontend UI | React 19 + Vite 7 |
| Styling | Tailwind CSS v4 |
| Browser automation | puppeteer-core 24 (connects to local Chrome) |
| AI / Chat | Ollama (local) — `qwen3.5:2b` |
| Voice input | Python `speech_recognition` + Google STT API |
| IPC bridge | Electron `contextBridge` + `ipcMain` / `ipcRenderer` |
| Icons | lucide-react |
| Persistence | JSON file via `app.getPath('userData')` |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process               │
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  IPC Hub   │  │ Puppeteer    │  │  STT Client │  │
│  │ (ipcMain)  │  │ Agent (CJS)  │  │  (polling)  │  │
│  └─────┬──────┘  └──────┬───────┘  └──────┬──────┘  │
│        │                │                  │          │
└────────┼────────────────┼──────────────────┼─────────┘
         │                │                  │
┌────────▼────────┐  ┌────▼──────┐  ┌────────▼────────┐
│  React Renderer │  │  Chrome   │  │  Python STT     │
│  (Vite + TW)    │  │(Puppeteer)│  │  Server :5050   │
│  Spotlight.jsx  │  │           │  │  (HTTP + mic)   │
└─────────────────┘  └───────────┘  └─────────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Ollama :11434  │
                                    │  qwen3.5:2b     │
                                    └─────────────────┘
```

The main process (`electron/main.cjs`) owns the Puppeteer browser session and all agent state. The React renderer communicates exclusively through the `contextBridge` preload — no direct `ipcRenderer` access from the renderer. The Python STT server is spawned as a child process and polled over HTTP.

---

## Project Structure

```
BUDDY-AI/
├── electron/
│   ├── main.cjs          # Main process: IPC handlers, Puppeteer agent, window/tray management
│   └── preload.js        # contextBridge — exposes safe IPC API to renderer
├── python/
│   ├── buddy_stt.py      # STT server: wake word detection + Google speech recognition
│   └── requirements.txt  # Python dependencies
├── src/
│   ├── ai/
│   │   └── gemini.js     # Ollama API wrapper (askBuddy function)
│   ├── components/
│   │   ├── Spotlight.jsx # Main UI: chat, agent approval cards, voice indicator
│   │   ├── CommandInput.jsx
│   │   ├── ActivityLog.jsx
│   │   ├── Hero.jsx
│   │   └── Features.jsx
│   ├── store/
│   │   └── chatStore.js  # In-memory session state
│   ├── App.jsx
│   └── main.jsx
├── package.json
├── vite.config.js
└── index.html
```

---

## Setup & Installation

### Requirements

- **Windows** (Chrome path is currently hardcoded to `C:\Program Files\Google\Chrome\Application\chrome.exe`)
- **Node.js** v18+
- **Python** 3.8+
- **Ollama** — running locally with `qwen3.5:2b` downloaded
- **Google Chrome** installed at the default path

### 1. Clone

```bash
git clone https://github.com/Tharunnagabramhagna/BUDDY-AI_Advanced-AI-Agent.git
cd BUDDY-AI_Advanced-AI-Agent
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Install Python dependencies

```bash
pip install SpeechRecognition pyaudio
```

### 4. Set up Ollama

```bash
# Install Ollama from https://ollama.com
ollama pull qwen3.5:2b
ollama serve
```

### 5. Start the dev server

```bash
npm run dev
```

### 6. Start Electron (in a second terminal)

```bash
npm run electron
```

Or use the combined start command (Windows):

```bash
npm start
```

---

## Agent Commands

| Input | What Buddy does |
|---|---|
| `open amazon and order shoes under 1500` | Searches Amazon.in, filters by ₹1500 budget, shows top 5 options for approval |
| `order biryani from zomato` | Opens Zomato, finds a restaurant, adds first available item to cart |
| `search flipkart for headphones` | Opens Flipkart, navigates to first product, adds to cart |
| `book ola cab to airport` | Opens Ola, pre-fills destination |
| `search youtube for lo-fi music` | Opens YouTube search in Chrome |
| `open vs code` | Launches VS Code via `exec` |
| `what is 15% of 2500` | Returns `375` instantly, no LLM call |
| anything else | Sent to local Ollama (qwen3.5:2b) |

---

## Security & Safety

- Every browser action is **approval-gated** — Buddy shows a confirmation card before executing
- Budget cap is set per-task on the approval card; the agent filters out products above the limit
- IPC is routed through `contextBridge` — the renderer has no direct Node or Electron access
- No API keys required — AI runs fully offline via Ollama

---

## Roadmap

**Near-term:**
- [ ] Persist Chrome session (user data directory) so login state survives app restarts
- [ ] Break up `main.cjs` into separate modules (agent, ipc, window, tray)
- [ ] Cross-platform Chrome path detection (macOS, Linux)
- [ ] Complete Swiggy checkout flow

**Longer-term:**
- [ ] Model switcher in UI (swap Ollama model without code changes)
- [ ] Plugin API for adding new automation targets
- [ ] macOS / Linux support

---

## Contributing

Issues and PRs welcome. The main areas that need work are the agent reliability (Puppeteer flows break when sites update their DOM) and the checkout flow. If you're adding a new automation target, the pattern to follow is in `executeAgentAction` in `electron/main.cjs`.

---

## Author

**Tharun** — [GitHub](https://github.com/Tharunnagabramhagna)

---

## License

MIT

