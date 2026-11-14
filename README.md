# BridgePlayer

Track 2 — Accessible Learning Media. Digital Bridge Accessibility Hackathon 2026.

One script tag turns any lesson video, on any platform, into something
Deaf, blind and 3G learners can use — plus a pipeline that builds the
accessibility assets automatically, and the required career-gateway
job card + certificate.

## Repo layout

```
player/     bridge-player.js — the embeddable script-tag player (vanilla JS)
pipeline/   FastAPI service: ffmpeg + faster-whisper -> captions, transcript,
            audio description, offline pack, job card, certificate
docs/       openapi.yaml — the API contract (build player + editor against
            this; it doesn't need the backend finished first)
test-target/  (create this) drop a page from the Savanna-static-pages repo
              here to prove the embed works on real, not-yours markup
```

## Quickstart

```bash
docker compose up --build
# pipeline API:   http://localhost:8000
# test page:      http://localhost:8080  (serves ./test-target)
```

Test embed against the real platform:
```bash
git clone https://github.com/alx-africa/Savanna-static-pages.git /tmp/savanna
cp -r /tmp/savanna/pages/* ./test-target/
# add <script src="/bridge-player.js"></script> + a container div to one
# of those pages, reload http://localhost:8080
```

## Team split (3 people)

Pick whichever mapping fits actual skills/interest — the point is three
tracks running in parallel against the shared `docs/openapi.yaml`
contract, so nobody blocks on anybody else until integration.

**A — Pipeline & infra**
`pipeline/app.py`, ffmpeg + faster-whisper wiring, Docker Compose,
offline pack (Opus + HTML + service worker + ZIP), axe-core in CI,
WCAG 2.2 AA conformance report. Natural fit for a security/networking
background: "no data leaves the host," privacy, and the Docker setup
are graded criteria (15 pts quality/security/privacy).

**B — Player**
`player/bridge-player.js`: keyboard + screen-reader control first,
resizable/recolourable captions, synced transcript, then the Ethiopian
Sign Language window and audio-description toggle. This is what the
co-designer tests unaided — get it in front of them early and often,
not once at the end.

**C — Editor, job card, certificate**
Trainer-facing caption/audio-description review UI (draft-then-verify —
Amharic ASR won't be perfect, a human confirms before anything ships),
the `schema.org/JobPosting` job card with audio summary at 200% zoom,
and the Open Badges 3.0 certificate + verify link. Also: Ethiopian
calendar dates on both (cheap, few teams will bother, graded under
"Built for Ethiopia").

## The gate (pass/fail, before any of the 100 points count)

1. Co-designer completes the main task — watch a lesson, captions on,
   sign window on, keyboard only — **unaided**.
2. `axe-core` clean: zero critical, zero serious issues.
3. WCAG 2.2 AA conformance report submitted with the code.

Test with the co-designer every few hours starting Saturday, not once
at the end. If a "must" doesn't pass with them, it doesn't count —
stop polishing anything else until it does.

## Submit by 16:30 Sunday

Code + README + `docker-compose.yml` + WCAG 2.2 AA conformance report.

## Reference

- API contract: `docs/openapi.yaml`
- Test target: https://github.com/alx-africa/Savanna-static-pages
- Full brief: Track 2, Digital Bridge Accessibility Hackathon 2026
