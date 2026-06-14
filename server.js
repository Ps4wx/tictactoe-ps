const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory game state ───────────────────────────────────────────────────
const rooms = {}; // roomCode -> Room

function createRoom(roomCode) {
  return {
    code: roomCode,
    players: [],          // [{id, name, symbol, score, connected}]
    board: Array(9).fill(null),
    currentTurn: 'X',
    status: 'waiting',    // waiting | playing | finished
    winner: null,
    matchHistory: [],
    createdAt: Date.now()
  };
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a,b,c] };
    }
  }
  if (board.every(cell => cell !== null)) return { winner: 'draw', line: [] };
  return null;
}

function getRoomState(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      name: p.name,
      symbol: p.symbol,
      score: p.score,
      connected: p.connected
    })),
    board: room.board,
    currentTurn: room.currentTurn,
    status: room.status,
    winner: room.winner,
    winLine: room.winLine || [],
    matchHistory: room.matchHistory
  };
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

// ─── BOT AI (Minimax) ────────────────────────────────────────────────────────
function minimax(board, isMaximizing, botSymbol, humanSymbol) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === botSymbol) return 10;
    if (result.winner === humanSymbol) return -10;
    return 0; // draw
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = botSymbol;
        best = Math.max(best, minimax(board, false, botSymbol, humanSymbol));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = humanSymbol;
        best = Math.min(best, minimax(board, true, botSymbol, humanSymbol));
        board[i] = null;
      }
    }
    return best;
  }
}

function getBotMove(board, botSymbol, humanSymbol) {
  let bestScore = -Infinity;
  let bestMove = -1;
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = botSymbol;
      const score = minimax(board, false, botSymbol, humanSymbol);
      board[i] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
  }
  return bestMove;
}

// ─── Socket.IO events ───────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Connected:', socket.id);

  // ── Create Room ──
  socket.on('createRoom', ({ playerName }) => {
    const name = (playerName || 'Player').trim().slice(0, 20);
    const code = generateRoomCode();
    rooms[code] = createRoom(code);
    const room = rooms[code];

    const player = { id: socket.id, name, symbol: 'X', score: 0, connected: true };
    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;

    socket.emit('roomCreated', { roomCode: code, symbol: 'X', playerName: name });
    socket.emit('gameState', getRoomState(room));
    console.log(`Room ${code} created by ${name}`);
  });

  // ── Join Room ──
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = (roomCode || '').trim().toUpperCase();
    const name = (playerName || 'Player').trim().slice(0, 20);

    if (!rooms[code]) {
      socket.emit('error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    const room = rooms[code];

    // Rejoin check
    const existing = room.players.find(p => p.name === name);
    if (existing && !existing.connected) {
      existing.id = socket.id;
      existing.connected = true;
      socket.join(code);
      socket.roomCode = code;
      socket.playerName = name;
      socket.emit('roomJoined', { roomCode: code, symbol: existing.symbol, playerName: name, rejoined: true });
      socket.emit('gameState', getRoomState(room));
      io.to(code).emit('playerRejoined', { name, symbol: existing.symbol });
      io.to(code).emit('gameState', getRoomState(room));
      io.to(code).emit('chatMessage', { system: true, text: `${name} reconnected.`, ts: Date.now() });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full. Please try a different room.' });
      return;
    }
    if (room.players.find(p => p.name === name)) {
      socket.emit('error', { message: 'That name is taken in this room. Choose another.' });
      return;
    }

    const player = { id: socket.id, name, symbol: 'O', score: 0, connected: true };
    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;
    room.status = 'playing';

    socket.emit('roomJoined', { roomCode: code, symbol: 'O', playerName: name });
    io.to(code).emit('gameState', getRoomState(room));
    io.to(code).emit('chatMessage', {
      system: true,
      text: `${name} joined! Game starts now. ${room.players[0].name} (X) goes first.`,
      ts: Date.now()
    });
    console.log(`${name} joined room ${code}`);
  });

  // ── Make Move (Multiplayer) ──
  socket.on('makeMove', ({ index }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    if (room.status !== 'playing') return;
    if (room.board[index] !== null) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.symbol !== room.currentTurn) return;

    room.board[index] = player.symbol;
    const result = checkWinner(room.board);

    if (result) {
      room.status = 'finished';
      room.winner = result.winner;
      room.winLine = result.line;

      if (result.winner !== 'draw') {
        const winner = room.players.find(p => p.symbol === result.winner);
        if (winner) winner.score += 1;
      }

      room.matchHistory.unshift({
        id: uuidv4(),
        winner: result.winner === 'draw' ? 'Draw' : room.players.find(p => p.symbol === result.winner)?.name,
        board: [...room.board],
        ts: Date.now()
      });
      if (room.matchHistory.length > 20) room.matchHistory.pop();
    } else {
      room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
    }

    io.to(code).emit('gameState', getRoomState(room));
  });

  // ── Rematch (Multiplayer) ──
  socket.on('requestRematch', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size >= 2) {
      room.board = Array(9).fill(null);
      room.status = 'playing';
      room.winner = null;
      room.winLine = [];
      room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
      room.rematchVotes = new Set();
      io.to(code).emit('gameState', getRoomState(room));
      io.to(code).emit('rematchStarted');
      io.to(code).emit('chatMessage', { system: true, text: 'Rematch started!', ts: Date.now() });
    } else {
      io.to(code).emit('rematchRequested', { from: player.name });
    }
  });

  // ── Chat Message ──
  socket.on('chatMessage', ({ text }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const msg = (text || '').trim().slice(0, 200);
    if (!msg) return;
    const player = rooms[code].players.find(p => p.id === socket.id);
    const name = player ? player.name : 'Unknown';
    io.to(code).emit('chatMessage', {
      from: name,
      symbol: player?.symbol,
      text: msg,
      ts: Date.now()
    });
  });

  // ── Typing indicator ──
  socket.on('typing', ({ isTyping }) => {
    const code = socket.roomCode;
    if (!code) return;
    const player = rooms[code]?.players.find(p => p.id === socket.id);
    if (!player) return;
    socket.to(code).emit('opponentTyping', { name: player.name, isTyping });
  });

  // ════════════════════════════════════════════════════
  // ── BOT GAME EVENTS ──────────────────────────────────
  // ════════════════════════════════════════════════════

  // Player "vs Bot" select karta hai
  socket.on('createBotRoom', ({ playerName }) => {
    const name = (playerName || 'Player').trim().slice(0, 20);
    const code = 'BOT_' + socket.id.slice(0, 8);

    const room = {
      code,
      isBot: true,
      players: [
        { id: socket.id, name, symbol: 'X', score: 0, connected: true },
        { id: 'BOT', name: '🤖 Bot', symbol: 'O', score: 0, connected: true }
      ],
      board: Array(9).fill(null),
      currentTurn: 'X',
      status: 'playing',
      winner: null,
      winLine: [],
      matchHistory: []
    };

    rooms[code] = room;
    socket.join(code);
    socket.roomCode = code;
    socket.playerName = name;

    socket.emit('roomJoined', { roomCode: code, symbol: 'X', playerName: name, isBot: true });
    socket.emit('gameState', getRoomState(room));
    socket.emit('chatMessage', {
      system: true,
      text: `Game vs Bot started! ${name} (X) goes first.`,
      ts: Date.now()
    });

    console.log(`Bot room created for ${name}`);
  });

  // Player ka move (bot game mein bhi same 'makeMove' use hoga)
  // Isliye makeMove ko modify kiya hai — bot room detect hoga
  // Upar wala makeMove already handle karta hai human ka move
  // Neeche bot ka auto-response add kiya hai:

  socket.on('makeBotMove', ({ index }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (!room.isBot) return;
    if (room.status !== 'playing') return;
    if (room.board[index] !== null) return;
    if (room.currentTurn !== 'X') return; // sirf human ki baari pe

    // Human ka move
    room.board[index] = 'X';
    let result = checkWinner(room.board);

    if (result) {
      room.status = 'finished';
      room.winner = result.winner;
      room.winLine = result.line;
      if (result.winner === 'X') room.players[0].score += 1;
      room.matchHistory.unshift({
        id: uuidv4(),
        winner: result.winner === 'draw' ? 'Draw' : result.winner === 'X' ? room.players[0].name : '🤖 Bot',
        board: [...room.board],
        ts: Date.now()
      });
      socket.emit('gameState', getRoomState(room));
      return;
    }

    room.currentTurn = 'O';
    socket.emit('gameState', getRoomState(room)); // board update dikhao

    // Bot ka move — 600ms delay (natural lagta hai)
    setTimeout(() => {
      if (room.status !== 'playing') return;

      const botIndex = getBotMove([...room.board], 'O', 'X');
      room.board[botIndex] = 'O';
      result = checkWinner(room.board);

      if (result) {
        room.status = 'finished';
        room.winner = result.winner;
        room.winLine = result.line;
        if (result.winner === 'O') room.players[1].score += 1;
        room.matchHistory.unshift({
          id: uuidv4(),
          winner: result.winner === 'draw' ? 'Draw' : '🤖 Bot',
          board: [...room.board],
          ts: Date.now()
        });
      } else {
        room.currentTurn = 'X';
      }

      socket.emit('gameState', getRoomState(room));
    }, 600);
  });

  // Bot Rematch
  socket.on('requestBotRematch', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (!room.isBot) return;

    room.board = Array(9).fill(null);
    room.status = 'playing';
    room.winner = null;
    room.winLine = [];
    room.currentTurn = 'X';

    socket.emit('gameState', getRoomState(room));
    socket.emit('rematchStarted');
    socket.emit('chatMessage', { system: true, text: 'New game started! You go first.', ts: Date.now() });
  });

  // ─── Disconnect ──────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    if (room.isBot) {
      // Bot room turant delete
      delete rooms[code];
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      io.to(code).emit('playerDisconnected', { name: player.name, symbol: player.symbol });
      io.to(code).emit('gameState', getRoomState(room));
      io.to(code).emit('chatMessage', { system: true, text: `${player.name} disconnected.`, ts: Date.now() });

      setTimeout(() => {
        if (rooms[code] && room.players.every(p => !p.connected)) {
          delete rooms[code];
          console.log(`Room ${code} cleaned up`);
        }
      }, 10 * 60 * 1000);
    }
    console.log('Disconnected:', socket.id);
  });
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      
