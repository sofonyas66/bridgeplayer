/**
 * BridgePlayer — one script tag, one accessible player.
 *
 * Usage on any platform's page:
 *   <div id="lesson" data-bridge-video="VIDEO_ID" data-bridge-api="http://localhost:8000"></div>
 *   <script src="bridge-player.js"></script>
 */
(function () {
  "use strict";

  // Inject accessible player stylesheet once
  function injectStyles() {
    if (document.getElementById("bridge-player-styles")) return;
    const style = document.createElement("style");
    style.id = "bridge-player-styles";
    style.textContent = `
      .bp-root {
        position: relative;
        max-width: 800px;
        margin: 1rem auto;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #111827;
        color: #f3f4f6;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }

      .bp-video-wrapper {
        position: relative;
        width: 100%;
        background: #000;
      }

      .bp-video {
        width: 100%;
        height: auto;
        display: block;
        max-height: 480px;
        background: #000;
      }

      /* Non-negotiable focus indicator: 3px solid high-contrast outline */
      .bp-root button:focus-visible,
      .bp-root select:focus-visible,
      .bp-video:focus-visible,
      .bp-transcript:focus-visible,
      .bp-transcript-line:focus-visible {
        outline: 3px solid #ffbf47 !important;
        outline-offset: 2px !important;
      }

      .bp-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: #1f2937;
        border-top: 1px solid #374151;
      }

      .bp-controls button,
      .bp-controls select {
        padding: 0.45rem 0.85rem;
        font-size: 0.95rem;
        font-weight: 500;
        border: 1px solid #4b5563;
        border-radius: 4px;
        background: #374151;
        color: #ffffff;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
      }

      .bp-controls button:hover,
      .bp-controls select:hover {
        background: #4b5563;
      }

      .bp-caption-overlay {
        position: absolute;
        bottom: 24px;
        left: 5%;
        right: 5%;
        pointer-events: none;
        z-index: 10;
        display: flex;
        justify-content: center;
        text-align: center;
      }

      .bp-caption-text {
        display: inline-block;
        background: var(--bp-caption-bg, rgba(0, 0, 0, 0.88));
        color: var(--bp-caption-fg, #ffffff);
        font-size: var(--bp-caption-size, 1.25rem);
        font-weight: 600;
        line-height: 1.4;
        padding: 6px 14px;
        border-radius: 4px;
        white-space: pre-wrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
      }

      .bp-transcript-section {
        padding: 1rem;
        background: #111827;
        border-top: 1px solid #374151;
      }

      .bp-transcript-heading {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: #93c5fd;
      }

      .bp-transcript {
        max-height: 240px;
        overflow-y: auto;
        padding: 0.5rem;
        background: #1f2937;
        border: 1px solid #374151;
        border-radius: 6px;
      }

      .bp-transcript-line {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        margin: 0.25rem 0;
        border-radius: 4px;
        cursor: pointer;
        color: #e5e7eb;
        background: transparent;
        transition: background-color 0.15s ease;
      }

      .bp-transcript-line:hover {
        background: #374151;
      }

      .bp-transcript-line.bp-active-line {
        background: #1e3a5f !important;
        color: #ffffff !important;
        border-left: 4px solid #ffbf47;
        font-weight: 600;
      }

      .bp-timestamp {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.85rem;
        font-weight: 700;
        color: #93c5fd;
        flex-shrink: 0;
        min-width: 65px;
      }

      .bp-cue-text {
        flex: 1;
        font-size: 0.95rem;
      }

      .bp-cue-empty {
        font-style: italic;
        color: #9ca3af;
      }
    `;
    document.head.appendChild(style);
  }

  // Format seconds -> MM:SS or HH:MM:SS
  function formatSeconds(seconds) {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const hours = Math.floor(seconds / 3600);
    const remainder = seconds % 3600;
    const mins = Math.floor(remainder / 60);
    const secs = Math.floor(remainder % 60);
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // Parse WebVTT timestamp -> seconds
  function parseVttTimestamp(ts) {
    const clean = ts.trim();
    const parts = clean.split(":");
    if (parts.length === 3) {
      const h = parseFloat(parts[0]);
      const m = parseFloat(parts[1]);
      const s = parseFloat(parts[2]);
      return h * 3600 + m * 60 + s;
    } else if (parts.length === 2) {
      const m = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      return m * 60 + s;
    }
    return 0;
  }

  // Parse WebVTT text into an array of cue objects
  function parseWebVTT(vttText) {
    const lines = vttText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const cues = [];
    let i = 0;

    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes("-->")) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes("-->")) {
        const parts = line.split("-->");
        const startStr = parts[0].trim().split(" ")[0];
        const endStr = parts[1].trim().split(" ")[0];
        const start = parseVttTimestamp(startStr);
        const end = parseVttTimestamp(endStr);
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
          textLines.push(lines[i].trim());
          i++;
        }
        cues.push({
          start,
          end,
          startFormatted: formatSeconds(start),
          text: textLines.join(" "),
        });
      } else {
        i++;
      }
    }
    return cues;
  }

  function init(container) {
    injectStyles();

    const videoId = container.dataset.bridgeVideo;
    const apiBase = (container.dataset.bridgeApi || "").replace(/\/$/, "");
    if (!videoId) {
      console.error("BridgePlayer: data-bridge-video is required");
      return;
    }

    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Accessible lesson player");

    // --- Root container ---
    const root = document.createElement("div");
    root.className = "bp-root";

    // --- Video wrapper ---
    const videoWrapper = document.createElement("div");
    videoWrapper.className = "bp-video-wrapper";

    const video = document.createElement("video");
    video.className = "bp-video";
    video.setAttribute("tabindex", "0");
    video.setAttribute("aria-label", "Lesson video");
    video.setAttribute("preload", "metadata");
    video.crossOrigin = "anonymous";
    // Task 4: set video.src pointing to the media route
    video.src = `${apiBase}/videos/${videoId}/media`;

    // Real <track> elements for native AT support
    const capTrackEn = document.createElement("track");
    capTrackEn.kind = "captions";
    capTrackEn.label = "English";
    capTrackEn.srclang = "en";
    capTrackEn.src = `${apiBase}/videos/${videoId}/captions?lang=en`;
    capTrackEn.default = true;
    video.appendChild(capTrackEn);

    const capTrackAm = document.createElement("track");
    capTrackAm.kind = "captions";
    capTrackAm.label = "አማርኛ";
    capTrackAm.srclang = "am";
    capTrackAm.src = `${apiBase}/videos/${videoId}/captions?lang=am`;
    video.appendChild(capTrackAm);

    videoWrapper.appendChild(video);

    // --- Visible, resizable caption overlay ---
    const captionOverlay = document.createElement("div");
    captionOverlay.className = "bp-caption-overlay";
    captionOverlay.setAttribute("aria-live", "polite");
    captionOverlay.setAttribute("aria-atomic", "true");

    const captionTextSpan = document.createElement("span");
    captionTextSpan.className = "bp-caption-text";
    captionTextSpan.style.display = "none";
    captionOverlay.appendChild(captionTextSpan);

    videoWrapper.appendChild(captionOverlay);
    root.appendChild(videoWrapper);

    // --- Controls Bar ---
    const controls = document.createElement("div");
    controls.className = "bp-controls";
    controls.setAttribute("role", "toolbar");
    controls.setAttribute("aria-label", "Player controls");

    // Play/Pause button
    const playBtn = makeButton("Play or pause video", "Play ⏯", () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });
    video.addEventListener("play", () => {
      playBtn.textContent = "Pause ⏸";
      playBtn.setAttribute("aria-label", "Pause video");
    });
    video.addEventListener("pause", () => {
      playBtn.textContent = "Play ▶";
      playBtn.setAttribute("aria-label", "Play video");
    });
    controls.appendChild(playBtn);

    // Caption size buttons
    controls.appendChild(
      makeButton("Increase caption size", "A+", () => resizeCaptions(1.15))
    );
    controls.appendChild(
      makeButton("Decrease caption size", "A-", () => resizeCaptions(0.85))
    );

    // Language switcher (<select>)
    const langSelect = document.createElement("select");
    langSelect.setAttribute("aria-label", "Select caption and transcript language");
    langSelect.className = "bp-lang-select";

    const optEn = document.createElement("option");
    optEn.value = "en";
    optEn.textContent = "Captions: English";
    langSelect.appendChild(optEn);

    const optAm = document.createElement("option");
    optAm.value = "am";
    optAm.textContent = "Captions: አማርኛ (Draft)";
    langSelect.appendChild(optAm);

    controls.appendChild(langSelect);
    root.appendChild(controls);

    // --- Transcript Panel ---
    const transcriptSection = document.createElement("div");
    transcriptSection.className = "bp-transcript-section";

    const transcriptHeading = document.createElement("h2");
    transcriptHeading.className = "bp-transcript-heading";
    transcriptHeading.textContent = "Transcript";
    transcriptSection.appendChild(transcriptHeading);

    const transcript = document.createElement("div");
    transcript.className = "bp-transcript";
    transcript.setAttribute("role", "region");
    transcript.setAttribute("aria-label", "Lesson transcript");
    transcript.setAttribute("tabindex", "0");
    transcriptSection.appendChild(transcript);

    root.appendChild(transcriptSection);
    container.appendChild(root);

    // --- State and Cache ---
    let currentLang = "en";
    const cuesCache = { en: [], am: [] };
    let transcriptLineElements = [];

    function makeButton(label, text, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.textContent = text;
      b.addEventListener("click", onClick);
      return b;
    }

    function resizeCaptions(factor) {
      const current = parseFloat(
        getComputedStyle(captionOverlay).getPropertyValue("--bp-caption-size") || "1.25"
      );
      const nextSize = Math.max(0.75, Math.min(2.5, current * factor));
      captionOverlay.style.setProperty("--bp-caption-size", `${nextSize}rem`);
    }

    // Set active TextTrack mode ("hidden" so cues fire without browser shadow captions)
    function syncTextTrackModes() {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.language === currentLang) {
          track.mode = "hidden";
        } else {
          track.mode = "disabled";
        }
      }
    }

    // Update the caption overlay with cue text
    function updateOverlayText(text) {
      if (text && text.trim()) {
        captionTextSpan.textContent = text.trim();
        captionTextSpan.style.display = "inline-block";
      } else {
        captionTextSpan.textContent = "";
        captionTextSpan.style.display = "none";
      }
    }

    // Highlight active line in transcript and scroll into view
    function highlightTranscriptCue(activeCues) {
      if (!activeCues || activeCues.length === 0) {
        transcriptLineElements.forEach((el) => el.classList.remove("bp-active-line"));
        return;
      }
      const activeStart = activeCues[0].start;
      let matchedEl = null;

      transcriptLineElements.forEach((el) => {
        const start = parseFloat(el.dataset.start);
        const end = parseFloat(el.dataset.end);
        if (video.currentTime >= start && video.currentTime <= end) {
          el.classList.add("bp-active-line");
          matchedEl = el;
        } else {
          el.classList.remove("bp-active-line");
        }
      });

      if (matchedEl) {
        matchedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Render transcript cues into the transcript container
    function renderTranscript(cues) {
      transcript.innerHTML = "";
      transcriptLineElements = [];

      if (!cues || cues.length === 0) {
        const p = document.createElement("p");
        p.className = "bp-transcript-line bp-cue-empty";
        p.textContent = "No transcript cues available for this language.";
        transcript.appendChild(p);
        return;
      }

      cues.forEach((cue) => {
        const line = document.createElement("p");
        line.className = "bp-transcript-line";
        line.setAttribute("role", "button");
        line.setAttribute("tabindex", "0");
        line.dataset.start = String(cue.start);
        line.dataset.end = String(cue.end);

        const displayText = cue.text || "[Draft - speech detected]";
        line.setAttribute("aria-label", `${cue.startFormatted}: ${displayText}`);

        const timeSpan = document.createElement("span");
        timeSpan.className = "bp-timestamp";
        timeSpan.textContent = `[${cue.startFormatted}]`;

        const textSpan = document.createElement("span");
        textSpan.className = `bp-cue-text${cue.text ? "" : " bp-cue-empty"}`;
        textSpan.textContent = displayText;

        line.appendChild(timeSpan);
        line.appendChild(textSpan);

        function jumpToCue() {
          video.currentTime = cue.start;
          video.play();
        }

        line.addEventListener("click", jumpToCue);
        line.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            jumpToCue();
          }
        });

        transcript.appendChild(line);
        transcriptLineElements.push(line);
      });
    }

    // Load VTT for a language, parse cues, update cuesCache, populate native TextTrack
    async function loadLanguageVTT(lang) {
      try {
        const res = await fetch(`${apiBase}/videos/${videoId}/captions?lang=${lang}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const vttText = await res.text();
        const parsed = parseWebVTT(vttText);
        cuesCache[lang] = parsed;

        // Populate native TextTrack if empty
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i];
          if (track.language === lang && (!track.cues || track.cues.length === 0)) {
            parsed.forEach((c) => {
              try {
                if (window.VTTCue) {
                  track.addCue(new VTTCue(c.start, c.end, c.text || ""));
                }
              } catch (_) {}
            });
          }
        }
      } catch (err) {
        console.warn(`BridgePlayer: failed to fetch captions for ${lang}:`, err);
        cuesCache[lang] = [];
      }

      if (lang === currentLang) {
        renderTranscript(cuesCache[lang]);
      }
    }

    // Listen to cuechange on all tracks to update overlay and transcript
    function attachTrackListeners() {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        track.addEventListener("cuechange", () => {
          if (track.language !== currentLang) return;
          const active = track.activeCues;
          if (active && active.length > 0) {
            const activeText = Array.from(active)
              .map((c) => c.text)
              .filter(Boolean)
              .join("\n");
            updateOverlayText(activeText);
            highlightTranscriptCue(active);
          } else {
            updateOverlayText("");
            highlightTranscriptCue([]);
          }
        });
      }
    }

    // Fallback sync via timeupdate in case browser native cuechange has lag
    video.addEventListener("timeupdate", () => {
      const cues = cuesCache[currentLang] || [];
      const current = video.currentTime;
      const activeCue = cues.find((c) => current >= c.start && current <= c.end);

      if (activeCue) {
        if (!captionTextSpan.textContent && activeCue.text) {
          updateOverlayText(activeCue.text);
        }
        highlightTranscriptCue([activeCue]);
      } else {
        if (video.textTracks.length === 0) {
          updateOverlayText("");
          highlightTranscriptCue([]);
        }
      }
    });

    // Language selection handler
    langSelect.addEventListener("change", (e) => {
      currentLang = e.target.value;
      syncTextTrackModes();
      updateOverlayText("");
      renderTranscript(cuesCache[currentLang]);
    });

    // Init: load captions for both en and am, sync tracks, attach listeners
    Promise.all([loadLanguageVTT("en"), loadLanguageVTT("am")]).then(() => {
      syncTextTrackModes();
      attachTrackListeners();
    });

    // Keyboard support on video (Space = play/pause, Arrow keys = seek)
    video.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        video.paused ? video.play() : video.pause();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
      }
    });
  }

  function boot() {
    document.querySelectorAll("[data-bridge-video]").forEach(init);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
