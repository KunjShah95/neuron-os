/**
 * Programmatic notification sounds using the Web Audio API.
 *
 * All sounds are generated at runtime — no audio files needed.
 * Uses OscillatorNode and GainNode to create simple synthesized tones.
 */

let audioCtx: AudioContext | null = null

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  // Resume if suspended (browsers require user gesture to start)
  if (audioCtx.state === "suspended") {
    audioCtx.resume()
  }
  return audioCtx
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
  rampDown = true,
) {
  try {
    const ctx = getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)

    // Attack
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)

    // Sustain, then release
    if (rampDown) {
      gain.gain.setValueAtTime(volume, ctx.currentTime + duration * 0.6)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration)
    } else {
      gain.gain.setValueAtTime(volume, ctx.currentTime + duration)
    }

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {
    // Audio not available — silently ignore
  }
}

/** Rising two-note chime — agent spawned successfully */
export function playSpawnSound() {
  const ctx = getContext()

  // First note: C5
  playTone(523.25, 0.15, "sine", 0.12)

  // Second note: E5 (scheduled via AudioContext for timing accuracy)
  const secondNoteTime = ctx.currentTime + 0.08
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(659.25, secondNoteTime)
    gain.gain.setValueAtTime(0, secondNoteTime)
    gain.gain.linearRampToValueAtTime(0.12, secondNoteTime + 0.02)
    gain.gain.linearRampToValueAtTime(0, secondNoteTime + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(secondNoteTime)
    osc.stop(secondNoteTime + 0.2)
  } catch {}
}

/** Short descending tone — agent killed/stopped */
export function playKillSound() {
  const ctx = getContext()
  const now = ctx.currentTime

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "triangle"
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.linearRampToValueAtTime(220, now + 0.25)

    gain.gain.setValueAtTime(0.1, now)
    gain.gain.linearRampToValueAtTime(0.1, now + 0.1)
    gain.gain.linearRampToValueAtTime(0, now + 0.3)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.3)
  } catch {}
}

/** Harsh buzzer — error/error state */
export function playErrorSound() {
  const ctx = getContext()
  const now = ctx.currentTime

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "square"
    osc.frequency.setValueAtTime(150, now)
    osc.frequency.setValueAtTime(200, now + 0.1)

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.15)
    gain.gain.linearRampToValueAtTime(0, now + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.35)
  } catch {}
}

/** Soft chime — WebSocket connected */
export function playConnectSound() {
  const ctx = getContext()
  const now = ctx.currentTime

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1108.73, now + 0.08)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.03)
    gain.gain.setValueAtTime(0.08, now + 0.2)
    gain.gain.linearRampToValueAtTime(0, now + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.35)
  } catch {}
}

/** Generic notification — a subtle pop */
export function playNotificationSound() {
  playTone(600, 0.08, "sine", 0.06)
}
