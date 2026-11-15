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
import datetime
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from transcribe import run_pipeline

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bridgeplayer")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data/media"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")

app = FastAPI(title="BridgePlayer Pipeline API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        video_dir = DATA_DIR / video_id
        if video_dir.exists():
            mp4s = list(video_dir.glob("*.mp4"))
            if mp4s:
                return {
                    "id": video_id,
                    "title": mp4s[0].stem,
                    "status": "draft_ready",
                    "durationSeconds": None,
                    "captionsReady": {
                        "am": (video_dir / "captions.am.vtt").exists(),
                        "en": (video_dir / "captions.en.vtt").exists(),
                    },
                    "hasSignLanguage": False,
                    "hasAudioDescription": False,
                    "hasOfflinePack": False,
                    "source_path": str(mp4s[0]),
                    "media_filename": mp4s[0].name,
                }
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
        video_dir = DATA_DIR / video_id
        if video_dir.exists():
            mp4s = list(video_dir.glob("*.mp4"))
            if mp4s:
                return FileResponse(mp4s[0], media_type="video/mp4")
        raise HTTPException(404, "video not found")
    path = Path(video["source_path"])
    if not path.exists():
        raise HTTPException(404, "media file missing")
    return FileResponse(path, media_type="video/mp4")


# In-memory store for issued certificates
CREDENTIALS = {}


@app.get("/videos/{video_id}/jobcard")
async def get_job_card(video_id: str):
    return {
        "jobPosting": {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Junior Video Accessibility Specialist",
            "description": "Review and verify draft captions, synchronized transcripts, and accessible media for educational lessons.",
            "datePosted": "2026-11-15",
            "validThrough": "2026-12-15",
            "employmentType": "FULL_TIME",
            "hiringOrganization": {
                "@type": "Organization",
                "name": "Digital Bridge Learning Initiative",
                "sameAs": "https://alxafrica.com"
            }
        },
        "audioSummaryText": "Job opportunity for a Junior Video Accessibility Specialist at Digital Bridge. Review captions and accessible media for online learners. Applications open through December."
    }


@app.get("/learners/{learner_id}/certificate")
async def get_certificate(learner_id: str):
    cred_id = str(uuid.uuid4())
    issued_on = datetime.date.today().isoformat()
    verify_url = f"http://localhost:8000/certificates/{cred_id}/verify"

    cert = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://purl.imsglobal.org/spec/ob/v3p0/context.json"
        ],
        "id": f"urn:uuid:{cred_id}",
        "type": ["VerifiableCredential", "OpenBadgeCredential"],
        "issuer": {
            "id": "https://alxafrica.com",
            "name": "ALX Ethiopia / Digital Bridge"
        },
        "credentialSubject": {
            "id": f"urn:learner:{learner_id}",
            "achievement": {
                "name": "BridgePlayer Accessible Lesson - Completed"
            }
        },
        "verifyUrl": verify_url
    }

    CREDENTIALS[cred_id] = {
        "valid": True,
        "issuedOn": issued_on
    }

    return cert


@app.get("/certificates/{credential_id}/verify")
async def verify_certificate(credential_id: str):
    cred = CREDENTIALS.get(credential_id)
    if not cred:
        return {"valid": False, "issuedOn": None}
    return cred


# TODO: /videos/{id}/description-track, /videos/{id}/sign-language,
# /videos/{id}/offline-pack, /videos/{id}/jobcard,
# /learners/{id}/certificate, /certificates/{id}/verify
# — see docs/openapi.yaml for the exact contract for each.
