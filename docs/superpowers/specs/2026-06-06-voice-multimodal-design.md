# Voice & Multimodal I/O — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — Whisper STT + TTS in TUI, dashboard, and 8 messaging adapters

## Context

Aegis today is text-only at the I/O layer. The 8 messaging adapters (Discord, Slack, SMS, Voice via Twilio, WhatsApp, Email, Webhook, Bot-Commands) and the TUI all assume text in / text out. Hermes Agent's voice mode is one of its most demoed features; CheetahClaws and nanobot both ship local Whisper + TTS as differentiators.

The Twilio Voice adapter already exists, but it does **outbound calls + DTMF**, not bidirectional voice-with-AI. This spec adds proper real-time voice interaction to the TUI and dashboard, and inbound/outbound voice messages (not full calls) to the 8 adapters.

## 1. Goals

1. **STT in TUI** — push-to-talk (spacebar) or voice-activated; transcripts inject as user turns.
2. **TTS in TUI** — agent replies stream as synthesized audio with a waveform indicator.
3. **Voice in dashboard** — a "Voice orb" component (hold to talk / release to send).
4. **Voice messages in adapters** — Telegram, Discord, Slack, WhatsApp, Signal, Matrix handle inbound voice notes (download → STT → text turn); outbound voice replies are opt-in per-adapter.
5. **Local-first default** — Whisper.cpp + Piper TTS run locally, no API keys.
6. **Cloud opt-in** — OpenAI Whisper API and ElevenLabs available for users who want better quality.

## 2. Non-Goals (v1)

- Real-time duplex voice (full interruption, overlap, turn-taking) — push-to-talk is the v1 model; duplex is v2
- Vision/image input — already handled by the `vision_analyze` tool; multimodal here is text+voice only
- Voice cloning / custom voices — bundled Piper voices only
- Outbound phone calls (the Twilio Voice adapter already covers DTMF/IVR; not changing)
- Voice biometrics / speaker identification
- Music generation or audio effects

## 3. Architecture

```
  ┌─────────────────────────────────────────────────────────┐
  │  TUI (src/tui/components/voice-input.ts)                │
  │  Dashboard (dashboard/src/components/VoiceOrb.tsx)     │
  │  Adapters: telegram, discord, slack, whatsapp, signal, │
  │            matrix, sms, bot-commands                    │
  │    - on voice message: download → STT → text turn      │
  │    - on text reply with TTS enabled: synthesize audio  │
  └─────────────┬───────────────────────────────────────────┘
                │ audio frames
                ▼
  ┌─────────────────────────────────────────────────────────┐
  │  src/voice/                                             │
  │    - capture.ts   (node-record-lpcm16 wrapper)         │
  │    - playback.ts  (speaker wrapper)                    │
  │    - orchestrator.ts  (STT/TTS + agent loop bridge)    │
  │    - providers/                                         │
  │        stt/                                              │
  │          whisper-local.ts   (whisper.cpp via bun:ffi)  │
  │          whisper-cloud.ts   (OpenAI Whisper API)       │
  │        tts/                                              │
  │          piper-local.ts     (Piper subprocess)         │
  │          elevenlabs.ts      (ElevenLabs streaming API) │
  │    - config.ts   (Zod schema for VoiceConfig)          │
  └─────────────────────────────────────────────────────────┘
```

## 4. VoiceConfig Schema (Zod)

```ts
const VoiceConfig = z.object({
  enabled: z.boolean().default(false),
  stt: z.enum(['off', 'local', 'cloud']).default('local'),
  tts: z.enum(['off', 'local', 'cloud']).default('local'),
  stt_language: z.string().default('en'),
  tts_voice: z.string().default('en_US-lessac-medium'),  // Piper voice name
  input_device: z.string().optional(),                    // OS device name; auto-detect if unset
  output_device: z.string().optional(),
  push_to_talk_key: z.string().default('space'),
  voice_activation_threshold: z.number().min(0).max(1).default(0.02),  // RMS
})
```

Stored at `~/.aegis/voice.yaml`.

## 5. STTProvider / TTSProvider Traits

```ts
interface STTProvider {
  name: string
  transcribe(audio: Buffer, opts: { language?: string }): Promise<{ text: string, duration_ms: number }>
  isAvailable(): Promise<{ ok: boolean, reason?: string }>  // checks binary presence, API key, etc.
}

interface TTSProvider {
  name: string
  synthesize(text: string, opts: { voice?: string, stream?: boolean }): AsyncIterable<Buffer>
  isAvailable(): Promise<{ ok: boolean, reason?: string }>
}
```

**Whisper local** uses `whisper.cpp` invoked as a subprocess (Bun wraps it; the binary must be on `$PATH` or set via `AEGIS_WHISPER_BIN`). Model auto-downloaded to `~/.aegis/models/whisper/<size>.bin` on first use (`tiny` default, `base` opt-in, `small` for power users).

**Piper local** uses the `piper` TTS binary, same pattern. Voices auto-downloaded to `~/.aegis/models/piper/<voice>.onnx` + `.json` on first use.

**Cloud providers** require the respective API key in env (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`).

## 6. Orchestrator

The orchestrator bridges the audio I/O with the existing agent loop. The agent loop already exposes a streaming chat interface (`engine.streamChat`), so the orchestrator just:

1. Captures audio → STT → produces a user turn
2. Calls `engine.streamChat([..., newTurn])`
3. For each text chunk from the stream, if TTS enabled, yields the chunk to `ttsProvider.synthesize(chunk, { stream: true })`
4. Plays back the audio chunks in order
5. Stores the text reply normally (audit log, memory, etc.) — voice is a presentation layer, not a separate channel

**Push-to-talk flow (TUI):**
1. User holds space → `capture.start()` records 16kHz mono PCM
2. User releases → `capture.stop()` returns a `Buffer`
3. STT transcribes → text appears in the input box (user can edit)
4. User hits Enter to send, or releases into auto-send mode (config: `auto_send: true`)

**Voice activation (optional):**
1. `capture.start()` runs continuously in the background
2. RMS-based VAD triggers when audio exceeds `voice_activation_threshold` for 300ms
3. On silence >800ms, capture stops and STT runs

**Streaming TTS:**
- Piper streams sentence-by-sentence (we split on `.`, `?`, `!`, `:` followed by space)
- ElevenLabs uses its native streaming endpoint
- Each audio chunk is queued and played in order; a 200ms crossfade prevents click artifacts

## 7. Adapter Integration

Each adapter gets two new optional hooks:

```ts
interface AdapterVoiceHooks {
  onInboundVoice?(msg: InboundVoiceMessage): Promise<void>  // download + STT + forward as text turn
  onOutboundVoice?(text: string, opts: { voice?: string }): Promise<VoicePayload | null>  // synthesize + return payload to send
}
```

Inbound flow:
1. Adapter receives a voice message (Telegram `voice`/`audio`, Discord attachment, WhatsApp `audio`, etc.)
2. Downloads to `~/.aegis/voice/inbox/<message_id>.<ext>`
3. Calls `sttProvider.transcribe(buffer, { language: detected })`
4. Forwards the transcript as a text turn with metadata `{ voice: true, original_message_id, stt_provider, stt_confidence }`
5. The user can configure per-adapter: "always reply with voice" / "only reply with voice if the user sent voice" / "never reply with voice"

Outbound flow:
1. Agent emits a reply turn
2. If adapter's `outbound_voice_mode` matches and TTS enabled, `ttsProvider.synthesize(text)` is called
3. Resulting audio is sent via the adapter's native voice-message API (Telegram `sendVoice`, Discord attachment, etc.)
4. If voice synthesis fails, fall back to text reply; do not fail the user-facing turn

## 8. Dependencies

| Package | Why | License |
|---|---|---|
| `node-record-lpcm16` | Mic capture (cross-platform) | MIT |
| `speaker` | Audio playback (cross-platform) | MIT |
| `@types/node-record-lpcm16` | Types | MIT |
| `whisper.cpp` binary | Local STT (subprocess) | MIT |
| `piper` binary | Local TTS (subprocess) | MIT |
| `elevenlabs` (npm) | Cloud TTS client (optional) | MIT |

All MIT-licensed. The whisper.cpp and Piper binaries are downloaded on first use, not bundled.

## 9. CLI / Config Surface

```bash
aegis voice doctor                         # check device enumeration, provider availability
aegis voice config                         # interactive: pick devices, providers, voices
aegis voice test stt [<file>]              # transcribe a WAV (or live mic)
aegis voice test tts "Hello world"         # play synthesized audio
aegis voice test roundtrip                 # capture 5s → STT → reply → TTS
```

Dashboard: a "Voice" settings page under `/settings/voice`.

Per-adapter env: `AEGIS_ADAPTER_<NAME>_VOICE_OUT=auto|always|never` (default `auto`).

## 10. Error Handling

| Failure | Behavior |
|---|---|
| Mic device busy / not found | Fall back to text input; emit warning; prompt user to pick a different device via `aegis voice config` |
| Whisper.cpp missing | Fall back to cloud STT with a one-time warning ("this will use OpenAI"); if cloud also unavailable, disable STT |
| Piper missing | Same pattern: fall back to cloud TTS, then off |
| STT timeout (>10s for 30s audio) | Return partial transcript; flag in metadata |
| TTS network failure (cloud) | Reply with text only; emit warning |
| Voice message download failure | Drop the message; emit audit event; reply to user (if outbound was triggered) with "I couldn't process that voice message" |
| STT confidence < 0.5 | Flag in metadata; agent may ask for confirmation |
| Concurrent STT/TTS operations | Mutex per session (don't try to listen while speaking) |

## 11. Testing

**Unit:**
- Provider trait compliance (Whisper local, Whisper cloud, Piper, ElevenLabs)
- Audio device enumeration mock
- VAD threshold logic
- STT confidence flagging

**Integration:**
- Feed a recorded WAV (`tests/fixtures/voice/hello.wav`) → assert STT output matches expected text
- Text → TTS → assert audio bytes are non-empty and playable
- Adapter inbound voice: Telegram fixture with a voice attachment → assert text turn created with `voice: true` metadata
- Adapter outbound voice: agent reply → assert voice message payload sent
- Whisper.cpp fallback to cloud: unset binary, set API key → assert works

**E2E (manual in CI; auto-test the audio path with pre-recorded fixtures):**
- TUI push-to-talk: hold space, speak, release, see transcript, hit enter
- Dashboard voice orb: click, speak, release, see reply play back
- Telegram voice note in → text reply (or voice note out if configured)

## 12. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(voice): provider traits + Whisper local + Piper local` | Foundation |
| 2 | `feat(voice): orchestrator + TUI push-to-talk` | TUI |
| 3 | `feat(voice): TUI streaming TTS + waveform` | TUI output |
| 4 | `feat(voice): dashboard VoiceOrb component` | Web |
| 5 | `feat(voice): Telegram/Discord inbound voice` | Adapters (subset) |
| 6 | `feat(voice): adapter outbound voice` | All 8 adapters |
| 7 | `feat(voice): cloud provider opt-ins` | Quality upgrade |
| 8 | `docs(voice): user guide + provider setup` | User-facing |

## 13. Open Questions (for plan review)

- Should the bundled whisper model default to `tiny` (fast, ~75 MB) or `base` (better, ~150 MB)? `tiny` is the recommended default unless the user opts up.
- For adapter voice replies, do we synthesize the full reply or summarize first? Synthesizing a 1000-token reply with Piper takes ~30s.
- Should we ship a `voice doctor` wizard that helps users pick the right input device (some users have multiple mics)?
