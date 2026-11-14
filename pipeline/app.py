"""
BridgePlayer pipeline service (skeleton).

Stack: FastAPI + ffmpeg + faster-whisper, all local (no paid APIs, no
data leaves the host — required for the "quality, security and privacy"
and "kept running" scoring criteria).

Run (inside the pipeline container, or locally with the deps installed):
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload

Matches docs/openapi.yaml — implement each route below to match that
contract so the player and editor can be built against the spec without
waiting on this service.
"""

import os
import uuid
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from transcribe import run_pipeline

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bridgeplayer")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data/media"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")

app = FastAPI(title="BridgePlayer Pipeline API", version="0.1.0")

# In-memory store for the hackathon — swap for sqlite/postgres if there's time.
VIDEOS = {}


def _process_video(video_id: str, video_path: Path, work_dir: Path):
    """Runs in the background after upload: ffmpeg + faster-whisper."""
    VIDEOS[video_id]["status"] = "transcribing"
    try:
        result = run_pipeline(video_path, work_dir, languages=("en", "am"),
                               model_size=WHISPER_MODEL)
        for lang, path in result["paths"].items():
            VIDEOS[video_id]["captionsReady"][lang] = path is not None
        if result["errors"]:
            log.warning("transcription errors for %s: %s", video_id, result["errors"])
            VIDEOS[video_id]["transcriptionErrors"] = result["errors"]
        VIDEOS[video_id]["status"] = "draft_ready"
    except Exception as e:  # noqa: BLE001
        log.exception("pipeline failed for %s", video_id)
        VIDEOS[video_id]["status"] = "error"
        VIDEOS[video_id]["error"] = str(e)


@app.post("/videos")
async def upload_video(background_tasks: BackgroundTasks,
                        file: UploadFile = File(...), title: str = Form(...),
                        language_hint: str = Form("am")):
    video_id = str(uuid.uuid4())
    video_dir = DATA_DIR / video_id
    video_dir.mkdir(parents=True, exist_ok=True)

    dest = video_dir / file.filename
    with open(dest, "wb") as f:
        f.write(await file.read())

    VIDEOS[video_id] = {
        "id": video_id,
        "title": title,
        "status": "uploaded",
        "durationSeconds": None,
        "captionsReady": {"am": False, "en": False},
        "hasSignLanguage": False,
        "hasAudioDescription": False,
        "hasOfflinePack": False,
        "source_path": str(dest),
        "media_filename": file.filename,
    }

    # Draft-then-verify: captions start as drafts (captionsReady stays
    # False/True only reflects "a draft file exists"); a human trainer
    # must PUT verified captions via /videos/{id}/captions before this
    # should be treated as final. Status flips uploaded -> transcribing
    # -> draft_ready (or error) in the background so the upload call
    # returns immediately.
    background_tasks.add_task(_process_video, video_id, dest, video_dir)

    return VIDEOS[video_id]


@app.get("/videos/{video_id}")
async def get_video(video_id: str):
    video = VIDEOS.get(video_id)
    if not video:
        raise HTTPException(404, "video not found")
    return video


@app.get("/videos/{video_id}/captions")
async def get_captions(video_id: str, lang: str):
    # TODO: return the stored WebVTT file for this lang (draft or verified)
    path = DATA_DIR / video_id / f"captions.{lang}.vtt"
    if not path.exists():
        raise HTTPException(404, "captions not ready")
    return FileResponse(path, media_type="text/vtt")


@app.put("/videos/{video_id}/captions")
async def put_captions(video_id: str, lang: str, body: bytes):
    # TODO: validate it's well-formed WebVTT before saving; mark
    # captionsReady[lang] = True once a human has verified it.
    path = DATA_DIR / video_id / f"captions.{lang}.vtt"
    path.write_bytes(body)
    if video_id in VIDEOS:
        VIDEOS[video_id]["captionsReady"][lang] = True
    return {"ok": True}


@app.get("/videos/{video_id}/media")
async def get_media(video_id: str):
    """Serves the raw uploaded video so the player can point <video src>
    at something real while testing, before streaming/transcoding is
    worth building."""
    video = VIDEOS.get(video_id)
    if not video:
        raise HTTPException(404, "video not found")
    path = Path(video["source_path"])
    if not path.exists():
        raise HTTPException(404, "media file missing")
    return FileResponse(path)


# TODO: /videos/{id}/description-track, /videos/{id}/sign-language,
# /videos/{id}/offline-pack, /videos/{id}/jobcard,
# /learners/{id}/certificate, /certificates/{id}/verify
# — see docs/openapi.yaml for the exact contract for each.
