# Buddy AI

> A desktop AI assistant built with Electron, React, and Puppeteer — voice-activated, agent-powered, and budget-aware.

---

##  Features

-  **Natural language commands** — say "open VS Code" or "search YouTube for lo-fi music"
-  **Browser automation agent** — order from Amazon, search Zomato/Swiggy/Flipkart, book Ola rides
-  **Budget-aware shopping** — set a max price before approving any purchase
-  **Approval-based execution** — Buddy always asks before taking any action in your browser
-  **Voice input** — Python speech recognition server with wake word ("Hey Buddy")
-  **Gemini AI chat** — powered by Google's Gemini 1.5 Flash model
-  **Local calculator** — evaluate math expressions instantly without sending to AI
-  **Global shortcut** — Ctrl+Alt+B to show/hide anywhere

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| Frontend UI | React + Vite |
| Browser automation | Puppeteer (headless Chrome) |
| AI/Chat | Google Gemini 1.5 Flash |
| Voice input | Python `speech_recognition` |
| IPC bridge | Electron contextBridge |
| Styling | Vanilla CSS (glassmorphism) |

---

## 📁 Project Structure

```
BUDDY-AI/
├── electron/
│   ├── main.cjs          # Main process: IPC, Puppeteer, command routing
│   └── preload.js        # Secure IPC bridge (contextBridge)
├── python/
│   └── buddy_stt.py      # Python STT server (wake word + transcription)
├── src/
│   └── components/
│       └── Spotlight.jsx # Main React UI component
├── public/               # Static assets
├── .env.example          # Environment variable template
├── package.json
├── vite.config.js
└── README.md
```

---

##  Setup & Run

### 1. Clone the repo
```bash
git clone https://github.com/Tharunnagabramhagna/BUDDY-AI-Advanced-ai-agent.git
cd BUDDY-AI-Advanced-ai-agent
```

### 2. Install Node dependencies
```bash
npm install
```

### 3. Install Python dependencies
```bash
pip install SpeechRecognition pyaudio
```

### 4. Create your `.env` file
```bash
cp .env.example .env
```
Then edit `.env` and add your Gemini API key:
```
VITE_GEMINI_API_KEY=your_key_here
```
Get a free key at: https://makersuite.google.com/app/apikey

### 5. Start the Vite dev server
```bash
npm run dev
```

### 6. Start Electron (in a second terminal)
```bash
npm run electron
```

---

##  Agent Commands (examples)

| What you say | What Buddy does |
|---|---|
| `open amazon and order shoes` | Opens Amazon, searches shoes, picks one within your budget, adds to cart |
| `order biryani from zomato` | Opens Zomato, searches biryani, tries to add to cart |
| `search flipkart for headphones` | Opens Flipkart, finds headphones, opens product, adds to cart |
| `book ola cab to airport` | Opens Ola cab booking |
| `open chrome` | Launches Chrome |
| `what is 15% of 2500` | Answers instantly: `375 ` |

---

## 🔒 Security Notes

- Buddy **always shows an approval card** before any browser action
- You can set a **₹ budget limit** on the approval card for shopping tasks
- Payment / checkout is **intentionally not automated** — you complete it manually
- API keys are loaded via `.env` and **never committed to Git**
- The IPC bridge uses `contextBridge` — no direct `ipcRenderer` access from renderer

---

## ⚠️ Requirements

- **Chrome** must be installed (Puppeteer uses your local Chrome, not a bundled one)
- **Node.js** v18+
- **Python** 3.8+ (for voice input)
- A valid **Gemini API key**

---

##  License

MIT — feel free to use, modify, and build on top of Buddy AI.
