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

    // Rejoin check: same name already in room but disconnected
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

  // ── Make Move ──
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

      // Add to match history
      const p0 = room.players[0];
      const p1 = room.players[1];
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

  // ── Rematch ──
  socket.on('requestRematch', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size >= 2) {
      // Reset board, swap first turn
      room.board = Array(9).fill(null);
      room.status = 'playing';
      room.winner = null;
      room.winLine = [];
      room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X'; // loser/other goes first
      room.rematchVotes = new Set();
      io.to(code).emit('gameState', getRoomState(room));
      io.to(code).emit('rematchStarted');
      io.to(code).emit('chatMessage', { system: true, text: 'Rematch started!', ts: Date.now() });
    } else {
      // Notify opponent
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

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.connected = false;
      io.to(code).emit('playerDisconnected', { name: player.name, symbol: player.symbol });
      io.to(code).emit('gameState', getRoomState(room));
      io.to(code).emit('chatMessage', { system: true, text: `${player.name} disconnected.`, ts: Date.now() });

      // Clean up empty rooms after 10 minutes
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
