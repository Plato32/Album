// Web Audio API Sound Synthesizer for Cozy Scrapbook effects
// This is 100% serverless, offline, and does not require downloading external audio files.

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1. Play paper tearing/unwrapping envelope sound
export function playTearSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Simulate paper crinkle with noise or quick low-to-high oscillator sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
    
    // Trigger a second higher pitched pop for the tear finish
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(450, ctx.currentTime);
      osc2.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.15);
      
      gain2.gain.setValueAtTime(0.15, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.25);
    }, 150);
    
  } catch (e) {
    console.warn('AudioContext not allowed or not supported yet.', e);
  }
}

// 2. Play tactile sticker pasting sound (Plop + soft chime)
export function playPasteSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Low frequency plop/thud
    const oscLow = ctx.createOscillator();
    const gainLow = ctx.createGain();
    
    oscLow.type = 'sine';
    oscLow.frequency.setValueAtTime(180, now);
    oscLow.frequency.exponentialRampToValueAtTime(60, now + 0.15);
    
    gainLow.gain.setValueAtTime(0.3, now);
    gainLow.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    
    oscLow.connect(gainLow);
    gainLow.connect(ctx.destination);
    oscLow.start(now);
    oscLow.stop(now + 0.2);
    
    // High happy chime
    setTimeout(() => {
      const oscHigh = ctx.createOscillator();
      const gainHigh = ctx.createGain();
      
      oscHigh.type = 'triangle';
      oscHigh.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      oscHigh.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      oscHigh.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
      
      gainHigh.gain.setValueAtTime(0.15, ctx.currentTime);
      gainHigh.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      oscHigh.connect(gainHigh);
      gainHigh.connect(ctx.destination);
      oscHigh.start();
      oscHigh.stop(ctx.currentTime + 0.4);
    }, 80);
    
  } catch (e) {
    console.warn('AudioContext failed.', e);
  }
}

// 3. Play high glitter sparkle arpeggio (Reveal rare/foil sticker)
export function playSparkleSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Sequence of quick sparkling notes (C6, E6, G6, C7)
    const notes = [1046.50, 1318.51, 1567.98, 2093.00];
    
    notes.forEach((freq, idx) => {
      const noteDelay = idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + noteDelay);
      
      gain.gain.setValueAtTime(0, now + noteDelay);
      gain.gain.linearRampToValueAtTime(0.08, now + noteDelay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + noteDelay + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + noteDelay);
      osc.stop(now + noteDelay + 0.35);
    });
    
  } catch (e) {
    console.warn('AudioContext failed.', e);
  }
}
