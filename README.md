# 🎮 TicTacToe PS — Online Multiplayer

**GAME CREATED BY PS**

A real-time online multiplayer Tic-Tac-Toe game with built-in chat, scoreboard, match history, and premium dark gaming UI.

---

## 📁 Project Structure

```
tictactoe/
├── server.js
├── package.json
├── render.yaml
├── .gitignore
└── public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── sounds.js
        └── game.js

---

## ✅ Features

- 🌐 Real-time multiplayer via Socket.IO
- 🏠 Create Room / Join Room with 6-character code
- 💬 Built-in real-time chat with typing indicator
- 🏆 Win / Loss / Draw detection with animations
- 📊 Live scoreboard for current session
- 📋 Match history with mini board replay
- 🟢 Online/offline player status indicators
- 🔄 Rematch system (both players must agree)
- 🔌 Disconnect handling + rejoin protection
- 🔔 Sound effects (moves, win, loss, draw, chat)
- 📱 Mobile-first responsive design
- 🌑 Premium neon dark mode UI

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+ installed
- npm 8+

### Steps

```bash
# 1. Navigate to the project folder
cd tictactoe

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
# OR for production:
npm start

# 4. Open in browser
# http://localhost:3000
```

---

## 🌍 Deploy on Render (Free)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit — TicTacToe PS"
git remote add origin https://github.com/YOUR_USERNAME/tictactoe-ps.git
git push -u origin main
```

### Step 2 — Create Render Web Service
1. Go to [https://render.com](https://render.com) and sign up/login
2. Click **New +** → **Web Service**
3. Connect your GitHub account and select the repo
4. Fill in the settings:
   - **Name:** `tictactoe-ps` (or any name)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service**
6. Wait ~2 minutes for deployment
7. Your app is live at `https://your-service-name.onrender.com`

### Step 3 — Share the URL
Send the URL to your friend. They open it on their phone, enter a name, and join with your room code!

---

## 🎮 How to Play

1. **Player 1** opens the app, enters their name, clicks **Create Room**
2. The game shows a 6-character room code (e.g., `XK7P2Q`)
3. **Player 1** shares that code with **Player 2**
4. **Player 2** opens the app on their phone, enters their name, clicks **Join Room**, types the code
5. Game starts immediately! Player X goes first
6. Use the **Chat** button to message your opponent
7. After a game ends, either player can request a **Rematch**

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |
| `NODE_ENV` | `development` | Environment |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Server | Node.js + Express |
| Real-time | Socket.IO 4.x |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | Google Fonts (Orbitron, Rajdhani) |
| Audio | Web Audio API |
| Deploy | Render |

---

## 📝 Notes

- Rooms auto-delete 10 minutes after both players disconnect
- Up to 20 matches stored in session history
- Player names are unique per room
- If you disconnect and rejoin with the same name, you resume your session
- No database required — all state is in memory

---

*GAME CREATED BY PS*
