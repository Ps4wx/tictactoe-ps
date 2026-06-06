// ═══════════════════════════════════════════════════
//  TicTacToe PS — Client Game Logic
// ═══════════════════════════════════════════════════

(() => {
'use strict';

// ── State ──────────────────────────────────────────
let socket;
let mySymbol = null;
let myName = '';
let roomCode = '';
let gameState = null;
let chatOpen = false;
let historyOpen = false;
let unreadChats = 0;
let typingTimer = null;
let isTyping = false;

// ── Screens ────────────────────────────────────────
const screens = {
  loading:  document.getElementById('loadingScreen'),
  home:     document.getElementById('homeScreen'),
  lobby:    document.getElementById('lobbyScreen'),
  game:     document.getElementById('gameScreen')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

// ── Loading Sequence ───────────────────────────────
function runLoadingScreen() {
  const bar = document.getElementById('loadingBar');
  const text = document.getElementById('loadingText');
  const messages = [
    'Initializing game...',
    'Loading assets...',
    'Connecting to server...',
    'Ready!'
  ];
  let progress = 0;
  let msgIdx = 0;

  const iv = setInterval(() => {
    progress += Math.random() * 18 + 8;
    if (progress > 100) progress = 100;
    bar.style.width = progress + '%';
    const mi = Math.floor((progress / 100) * (messages.length - 1));
    if (mi !== msgIdx) { msgIdx = mi; text.textContent = messages[msgIdx]; }
    if (progress >= 100) {
      clearInterval(iv);
      text.textContent = 'Ready!';
      setTimeout(() => {
        initSocket();
        showScreen('home');
      }, 500);
    }
  }, 120);
}

// ── Socket Initialization ──────────────────────────
function initSocket() {
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('connect_error', () => showToast('Connection error. Retrying...', 'error', 3000));

  socket.on('roomCreated', ({ roomCode: rc, symbol, playerName }) => {
    mySymbol = symbol;
    myName = playerName;
    roomCode = rc;
    document.getElementById('displayRoomCode').textContent = rc;
    updateLobbySlots();
    showScreen('lobby');
    SoundEngine.play('click');
  });

  socket.on('roomJoined', ({ roomCode: rc, symbol, playerName, rejoined }) => {
  mySymbol = symbol;
  myName = playerName;
  roomCode = rc;

  showScreen('lobby'); // <-- add this

  if (rejoined) showToast(`Welcome back, ${playerName}!`, 'info');
  SoundEngine.play('join');
});
  socket.on('gameState', (state) => {
    gameState = state;
    if (state.status === 'playing' || state.status === 'finished') {
      if (screens.game.classList.contains('active') === false && screens.lobby.classList.contains('active')) {
        showScreen('game');
        initGameUI();
      }
    }
    renderGameState(state);
  });

  socket.on('error', ({ message }) => {
    showToast(message, 'error', 4000);
    SoundEngine.play('error');
  });

  socket.on('playerDisconnected', ({ name }) => {
    showToast(`${name} disconnected`, 'error', 3000);
    updatePlayerStatus();
  });

  socket.on('playerRejoined', ({ name }) => {
    showToast(`${name} reconnected!`, 'success', 2500);
    updatePlayerStatus();
  });

  socket.on('chatMessage', ({ from, symbol, text, system, ts }) => {
    appendChatMessage({ from, symbol, text, system, ts });
    if (!chatOpen && !system) {
      unreadChats++;
      updateChatBadge();
      SoundEngine.play('chat');
    }
  });

  socket.on('opponentTyping', ({ name, isTyping }) => {
    const el = document.getElementById('typingIndicator');
    document.getElementById('typingName').textContent = name;
    el.classList.toggle('hidden', !isTyping);
  });

  socket.on('rematchRequested', ({ from }) => {
    const t = document.getElementById('rematchReqToast');
    t.style.display = 'block';
    showToast(`${from} wants a rematch!`, 'info', 3000);
    SoundEngine.play('chat');
  });

  socket.on('rematchStarted', () => {
    document.getElementById('resultOverlay').classList.add('hidden');
    document.getElementById('rematchToast').classList.add('hidden');
    document.getElementById('rematchReqToast').style.display = 'none';
    clearBoardUI();
    SoundEngine.play('join');
  });
}

// ── Home Screen ────────────────────────────────────
function initHome() {
  const nameInput = document.getElementById('playerNameInput');
  const createBtn = document.getElementById('createRoomBtn');
  const showJoinBtn = document.getElementById('showJoinBtn');
  const joinPanel = document.getElementById('joinPanel');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const joinBtn = document.getElementById('joinRoomBtn');

  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { showToast('Enter your name first!', 'error'); SoundEngine.play('error'); return; }
    SoundEngine.play('click');
    socket.emit('createRoom', { playerName: name });
  });

  showJoinBtn.addEventListener('click', () => {
    SoundEngine.play('click');
    joinPanel.classList.toggle('visible');
    if (joinPanel.classList.contains('visible')) roomCodeInput.focus();
  });

  joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) { showToast('Enter your name first!', 'error'); SoundEngine.play('error'); return; }
    if (code.length < 4) { showToast('Enter a valid room code!', 'error'); SoundEngine.play('error'); return; }
    SoundEngine.play('click');
    socket.emit('joinRoom', { roomCode: code, playerName: name });
  });

  roomCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createBtn.click(); });
}

// ── Lobby ──────────────────────────────────────────
function updateLobbySlots() {
  if (!gameState) {
    // Only our slot is filled initially
    const xName = document.getElementById('slot-x-name');
    const oName = document.getElementById('slot-o-name');
    const xDot  = document.getElementById('slot-x-status');
    const oDot  = document.getElementById('slot-o-status');

    if (mySymbol === 'X') {
      xName.textContent = myName;
      xDot.classList.add('online');
      oName.textContent = 'Waiting...';
    } else {
      oName.textContent = myName;
      oDot.classList.add('online');
    }
    return;
  }

  gameState.players.forEach(p => {
    const name = document.getElementById(`slot-${p.symbol.toLowerCase()}-name`);
    const dot  = document.getElementById(`slot-${p.symbol.toLowerCase()}-status`);
    if (name) name.textContent = p.name;
    if (dot) {
      dot.classList.toggle('online', p.connected);
      dot.classList.toggle('offline', !p.connected);
    }
  });

  const indicator = document.getElementById('waitingIndicator');
  if (gameState.players.length >= 2) {
    indicator.classList.add('hidden');
  }
}

document.getElementById('copyCodeBtn').addEventListener('click', () => {
  const code = document.getElementById('displayRoomCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Room code copied!', 'success', 1500);
    SoundEngine.play('click');
  }).catch(() => {
    showToast(`Room code: ${code}`, 'info');
  });
});

// ── Game UI Init ───────────────────────────────────
function initGameUI() {
  // Board cells
  document.querySelectorAll('.cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const idx = parseInt(cell.dataset.index);
      if (!gameState || gameState.status !== 'playing') return;
      if (gameState.currentTurn !== mySymbol) return;
      if (gameState.board[idx] !== null) return;
      SoundEngine.play('move');
      socket.emit('makeMove', { index: idx });
    });
  });

  // Panel buttons
  document.getElementById('openChatBtn').addEventListener('click', () => openPanel('chat'));
  document.getElementById('openHistoryBtn').addEventListener('click', () => openPanel('history'));
  document.getElementById('closeChatBtn').addEventListener('click', () => closePanel('chat'));
  document.getElementById('closeHistoryBtn').addEventListener('click', () => closePanel('history'));
  document.getElementById('panelBackdrop').addEventListener('click', closePanels);

  // Chat
  const chatInput = document.getElementById('chatInput');
  document.getElementById('sendChatBtn').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  chatInput.addEventListener('input', handleTyping);

  // Rematch
  document.getElementById('rematchBtn').addEventListener('click', () => {
    SoundEngine.play('click');
    socket.emit('requestRematch');
    document.getElementById('rematchToast').classList.remove('hidden');
    document.getElementById('resultOverlay').classList.add('hidden');
  });
  document.getElementById('acceptRematchBtn')?.addEventListener('click', () => {
    SoundEngine.play('click');
    socket.emit('requestRematch');
    document.getElementById('rematchReqToast').style.display = 'none';
  });

  // Leave
  document.getElementById('leaveGameBtn').addEventListener('click', leaveGame);
  document.getElementById('leaveResultBtn').addEventListener('click', leaveGame);
}

// ── Render Game State ──────────────────────────────
function renderGameState(state) {
  if (!state) return;

  // Update lobby slots
  updateLobbySlots();

  // Board
  renderBoard(state.board, state.winLine || []);

  // HUD
  state.players.forEach(p => {
    const sym = p.symbol.toLowerCase();
    const nameEl  = document.getElementById(`hud-${sym}-name`);
    const scoreEl = document.getElementById(`hud-${sym}-score`);
    const dotEl   = document.getElementById(`hud-${sym}-dot`);
    if (nameEl)  nameEl.textContent  = p.name;
    if (scoreEl) scoreEl.textContent = p.score;
    if (dotEl) {
      dotEl.classList.toggle('online',  p.connected);
      dotEl.classList.toggle('offline', !p.connected);
    }
  });

  // Turn indicator
  const turnInd   = document.getElementById('turnIndicator');
  const turnSym   = document.getElementById('turnSymbol');
  const turnText  = document.getElementById('turnText');

  if (state.status === 'playing') {
    const isMyTurn = state.currentTurn === mySymbol;
    turnSym.textContent = state.currentTurn === 'X' ? '✕' : '○';
    turnSym.className = `turn-symbol ${state.currentTurn === 'X' ? 'x-sym' : 'o-sym'}`;
    turnText.textContent = isMyTurn ? 'Your turn' : 'Opponent';
    turnInd.className = `turn-indicator ${isMyTurn ? (mySymbol === 'X' ? 'active-x' : 'active-o') : ''}`;
  } else if (state.status === 'finished') {
    turnText.textContent = 'Game over';
    turnSym.textContent = state.winner === 'draw' ? '=' : (state.winner === 'X' ? '✕' : '○');
    showResult(state);
  }

  // Match history
  renderHistory(state.matchHistory || []);
}

// ── Board Rendering ────────────────────────────────
function renderBoard(board, winLine) {
  const cells = document.querySelectorAll('.cell');
  cells.forEach((cell, i) => {
    const val = board[i];
    cell.textContent = '';
    cell.className = 'cell';

    if (val === 'X') {
      cell.textContent = '✕';
      cell.classList.add('x-cell', 'filled');
    } else if (val === 'O') {
      cell.textContent = '○';
      cell.classList.add('o-cell', 'filled');
    }

    if (winLine.includes(i)) cell.classList.add('win-cell');
  });
}

function clearBoardUI() {
  document.querySelectorAll('.cell').forEach(cell => {
    cell.textContent = '';
    cell.className = 'cell';
  });
}

// ── Result Overlay ─────────────────────────────────
let lastResultShown = null;

function showResult(state) {
  const resultKey = state.winner + '-' + (state.matchHistory?.[0]?.id || '');
  if (lastResultShown === resultKey) return;
  lastResultShown = resultKey;

  const overlay = document.getElementById('resultOverlay');
  const icon    = document.getElementById('resultIcon');
  const title   = document.getElementById('resultTitle');
  const sub     = document.getElementById('resultSub');

  if (state.winner === 'draw') {
    icon.textContent  = '🤝';
    title.textContent = "It's a Draw!";
    title.style.color = 'var(--text-secondary)';
    sub.textContent   = 'Nobody wins this round.';
    SoundEngine.play('draw');
  } else {
    const winnerPlayer = state.players.find(p => p.symbol === state.winner);
    const isMe = state.winner === mySymbol;
    if (isMe) {
      icon.textContent  = '🏆';
      title.textContent = 'You Win!';
      title.style.color = mySymbol === 'X' ? 'var(--x-color)' : 'var(--o-color)';
      sub.textContent   = `Excellent move, ${myName}!`;
      SoundEngine.play('win');
    } else {
      icon.textContent  = '😔';
      title.textContent = 'You Lose!';
      title.style.color = 'var(--text-secondary)';
      sub.textContent   = `${winnerPlayer?.name || 'Opponent'} wins this round.`;
      SoundEngine.play('lose');
    }
  }

  overlay.classList.remove('hidden');
}

// ── Player Status Update ───────────────────────────
function updatePlayerStatus() {
  if (!gameState) return;
  gameState.players.forEach(p => {
    const dot = document.getElementById(`hud-${p.symbol.toLowerCase()}-dot`);
    if (dot) {
      dot.classList.toggle('online',  p.connected);
      dot.classList.toggle('offline', !p.connected);
    }
  });
}

// ── Chat ───────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chatMessage', { text });
  input.value = '';
  stopTyping();
}

function appendChatMessage({ from, symbol, text, system, ts }) {
  const container = document.getElementById('chatMessages');
  const wrap = document.createElement('div');

  if (system) {
    wrap.className = 'chat-message system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
  } else {
    const isMe = from === myName;
    wrap.className = `chat-message ${isMe ? 'mine' : 'other'}`;
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = (symbol ? (symbol === 'X' ? '✕ ' : '○ ') : '') + from;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    wrap.appendChild(sender);
    wrap.appendChild(bubble);
  }

  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { isTyping: true });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 1800);
}

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit('typing', { isTyping: false });
  }
  clearTimeout(typingTimer);
}

function updateChatBadge() {
  const badge = document.getElementById('chatBadge');
  if (unreadChats > 0) {
    badge.textContent = unreadChats > 9 ? '9+' : unreadChats;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Match History ──────────────────────────────────
function renderHistory(history) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';

  if (!history.length) {
    list.innerHTML = '<div class="history-empty"><div class="empty-icon">📋</div><span>No matches yet</span></div>';
    return;
  }

  history.forEach(match => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const tag = document.createElement('div');
    tag.className = 'winner-tag ' + (match.winner === 'Draw' ? 'draw' : (match.winner === myName ? 'x-win' : 'o-win'));
    tag.textContent = match.winner === 'Draw' ? '🤝 Draw' : `🏆 ${match.winner} wins`;

    const miniBoard = document.createElement('div');
    miniBoard.className = 'mini-board';
    (match.board || []).forEach(cell => {
      const mc = document.createElement('div');
      mc.className = 'mini-cell' + (cell === 'X' ? ' x' : cell === 'O' ? ' o' : '');
      mc.textContent = cell === 'X' ? '✕' : cell === 'O' ? '○' : '';
      miniBoard.appendChild(mc);
    });

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = formatTime(match.ts);

    item.appendChild(tag);
    item.appendChild(miniBoard);
    item.appendChild(time);
    list.appendChild(item);
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Panel Management ───────────────────────────────
function openPanel(which) {
  closePanels();
  const panel   = document.getElementById(which + 'Panel');
  const backdrop = document.getElementById('panelBackdrop');
  panel.classList.add('open');
  backdrop.classList.remove('hidden');
  SoundEngine.play('click');

  if (which === 'chat') {
    chatOpen = true;
    unreadChats = 0;
    updateChatBadge();
    setTimeout(() => {
      const msgs = document.getElementById('chatMessages');
      msgs.scrollTop = msgs.scrollHeight;
      document.getElementById('chatInput').focus();
    }, 300);
  } else if (which === 'history') {
    historyOpen = true;
  }
}

function closePanel(which) {
  const panel = document.getElementById(which + 'Panel');
  panel.classList.remove('open');
  document.getElementById('panelBackdrop').classList.add('hidden');
  if (which === 'chat') chatOpen = false;
  if (which === 'history') historyOpen = false;
  SoundEngine.play('click');
}

function closePanels() {
  ['chatPanel', 'historyPanel'].forEach(id => document.getElementById(id).classList.remove('open'));
  document.getElementById('panelBackdrop').classList.add('hidden');
  chatOpen = false;
  historyOpen = false;
}

// ── Leave Game ─────────────────────────────────────
function leaveGame() {
  SoundEngine.play('click');
  if (socket) socket.disconnect();
  location.reload();
}

// ── Toast Notifications ────────────────────────────
function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Start ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showScreen('loading');
  runLoadingScreen();
  initHome();
});

})();
