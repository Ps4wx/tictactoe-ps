// ═══════════════════════════════════════
//  SoundEngine — Web Audio API synth sounds
// ═══════════════════════════════════════

const SoundEngine = (() => {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch(e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function playTone({ freq = 440, type = 'sine', duration = 0.15, gain = 0.3, attack = 0.005, fadeStart = 0.05, startTime = 0 }) {
    const c = getCtx();
    if (!c || !enabled) return;
    const t = c.currentTime + startTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.linearRampToValueAtTime(gain * 0.6, t + fadeStart);
    g.gain.linearRampToValueAtTime(0, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playNoise({ duration = 0.05, gain = 0.15, highpass = 800 }) {
    const c = getCtx();
    if (!c || !enabled) return;
    const bufSize = c.sampleRate * duration;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.linearRampToValueAtTime(0, c.currentTime + duration);
    src.connect(filter); filter.connect(g); g.connect(c.destination);
    src.start();
    src.stop(c.currentTime + duration);
  }

  const sounds = {
    move() {
      playTone({ freq: 660, type: 'triangle', duration: 0.12, gain: 0.25, attack: 0.005 });
      playTone({ freq: 880, type: 'sine', duration: 0.08, gain: 0.1, startTime: 0.03 });
    },
    opponentMove() {
      playTone({ freq: 440, type: 'triangle', duration: 0.12, gain: 0.2, attack: 0.005 });
    },
    win() {
      const melody = [523, 659, 784, 1047];
      melody.forEach((f, i) => {
        playTone({ freq: f, type: 'triangle', duration: 0.25, gain: 0.3, startTime: i * 0.12 });
      });
      setTimeout(() => {
        [1047, 1319].forEach((f, i) => {
          playTone({ freq: f, type: 'sine', duration: 0.4, gain: 0.2, startTime: i * 0.08 });
        });
      }, 480);
    },
    lose() {
      const melody = [523, 440, 370, 294];
      melody.forEach((f, i) => {
        playTone({ freq: f, type: 'sawtooth', duration: 0.3, gain: 0.15, startTime: i * 0.15 });
      });
    },
    draw() {
      playTone({ freq: 440, type: 'triangle', duration: 0.2, gain: 0.2 });
      playTone({ freq: 440, type: 'triangle', duration: 0.2, gain: 0.2, startTime: 0.25 });
      playTone({ freq: 370, type: 'triangle', duration: 0.4, gain: 0.15, startTime: 0.5 });
    },
    chat() {
      playTone({ freq: 1046, type: 'sine', duration: 0.07, gain: 0.15, attack: 0.005 });
      playTone({ freq: 1318, type: 'sine', duration: 0.07, gain: 0.12, startTime: 0.08 });
    },
    click() {
      playNoise({ duration: 0.04, gain: 0.12, highpass: 2000 });
      playTone({ freq: 800, type: 'square', duration: 0.04, gain: 0.08 });
    },
    join() {
      [523, 659, 784].forEach((f, i) => {
        playTone({ freq: f, type: 'sine', duration: 0.15, gain: 0.2, startTime: i * 0.1 });
      });
    },
    error() {
      playTone({ freq: 220, type: 'sawtooth', duration: 0.15, gain: 0.2 });
      playTone({ freq: 180, type: 'sawtooth', duration: 0.2, gain: 0.15, startTime: 0.1 });
    }
  };

  document.addEventListener('click', () => getCtx(), { once: true });
  document.addEventListener('touchstart', () => getCtx(), { once: true });

  return {
    play: (name) => { try { sounds[name]?.(); } catch(e) {} },
    setEnabled: (v) => { enabled = v; }
  };
})();
