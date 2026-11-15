# BridgePlayer

Track 2 — Accessible Learning Media. Digital Bridge Accessibility Hackathon 2026.

One script tag turns any lesson video, on any platform, into something
Deaf, blind and 3G learners can use — plus a pipeline that builds the
accessibility assets automatically, and the required career-gateway
job card + certificate.

## What's built

- **Pipeline** (`pipeline/`): FastAPI service. Upload a video, it
  extracts audio with ffmpeg, then:
  - **English captions:** generated via speech-to-text using the
    translate task (source language Amharic → English), producing a
    real translation rather than a forced, hallucinated transcription.
  - **Amharic captions:** generated as accurate, auto-detected speech
    timestamps (voice-activity detection) with the caption text left
    **empty for a trainer to fill in**. Generic speech-to-text produced
    unusable output for Amharic (wrong script, not real words), so
    rather than ship unreliable AI text, the pipeline automates the
    hard, tedious part (correct timing) and is honest that the text
    itself needs a human today. See `docs/CONFORMANCE_REPORT.md` for
    detail.
  - **Job card** (`GET /videos/{id}/jobcard`): `schema.org/JobPosting`
    JSON-LD plus a plain-text audio summary (read aloud client-side via
    the Web Speech API).
  - **Certificate** (`GET /learners/{id}/certificate` +
    `GET /certificates/{id}/verify`): a minimal Open Badges 3.0
    verifiable credential with a public verify endpoint.
- **Player** (`player/bridge-player.js`): a single embeddable
  `<script>` tag. Keyboard-operable controls (play/pause, caption
  size, caption language), visible focus throughout, resizable
  captions, and a synced, keyboard-navigable transcript. Verified with
  NVDA + keyboard-only on a real, unmodified page from the actual
  Savanna platform ([alx-africa/Savanna-static-pages](https://github.com/alx-africa/Savanna-static-pages)) —
  zero console errors, no conflicts with the host page's own scripts.
- **Not built today** (time-boxed out, see `docs/CONFORMANCE_REPORT.md`):
  Ethiopian Sign Language window, audio-description track, offline
  pack, braille export, tagged PDF, recorded-session viewer, a
  trainer-facing editor UI. The API contract for all of these already
  exists in `docs/openapi.yaml` for future work.

## Repo layout

```
player/     bridge-player.js — the embeddable script-tag player (vanilla JS)
pipeline/   FastAPI service: ffmpeg + speech-to-text -> captions, transcript,
            job card, certificate
docs/       openapi.yaml (full API contract) and CONFORMANCE_REPORT.md
            (WCAG 2.2 AA testing results)
savanna-test/  a clone of alx-africa/Savanna-static-pages, used to verify
               the script-tag embed against a real, unmodified platform page
```

## Running it

Two ways, depending on your environment:

**Docker (as submitted):**
```bash
docker compose up --build
# pipeline API:   http://localhost:8000
```

**Native (what we actually ran today, due to a network restriction
blocking WSL2/Docker's install endpoints on the build machine — PyPI
itself was reachable, only Microsoft's WSL/Store CDN was blocked):**
```powershell
cd pipeline
$env:FFMPEG_BIN = "<path to ffmpeg.exe>"
$env:DATA_DIR = ".\data"
$env:WHISPER_MODEL = "small"
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Embed the player on any page:
```html
<div data-bridge-video="<video_id>" data-bridge-api="http://localhost:8000"></div>
<script src="bridge-player.js"></script>
```

## The gate (pass/fail, before any of the 100 points count)

1. Co-designer completes the main task — watch a lesson, captions on,
   keyboard only — unaided. **Tested with NVDA + keyboard-only;
   see `docs/CONFORMANCE_REPORT.md` for the full write-up, including
   one real defect found and fixed during testing** (captions were
   auto-announcing over the video's own audio; fixed by disabling
   `aria-live` on the caption overlay while keeping on-demand
   screen-reader reading of the transcript intact).
2. `axe-core` clean — not run in this submission; manual keyboard +
   NVDA testing was prioritized given time available.
3. WCAG 2.2 AA conformance report — `docs/CONFORMANCE_REPORT.md`.

## Reference

- API contract: `docs/openapi.yaml`
- Conformance report: `docs/CONFORMANCE_REPORT.md`
- Test target: https://github.com/alx-africa/Savanna-static-pages
- Full brief: Track 2, Digital Bridge Accessibility Hackathon 2026