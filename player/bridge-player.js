/**
 * BridgePlayer — one script tag, one accessible player.
 *
 * Usage on any platform's page:
 *   <div id="lesson" data-bridge-video="VIDEO_ID" data-bridge-api="http://localhost:8000"></div>
 *   <script src="bridge-player.js"></script>
 *
 * Build order (see team plan):
 *   MUST (Sat):    keyboard + screen-reader control, resizable/recolourable
 *                  captions (am/en), synced transcript.
 *   SHOULD (Sat pm / Sun am): sign-language window, audio description.
 *   REQUIRED before submit (Sun): job card + certificate link below player.
 *
 * Accessibility non-negotiables (these are what the co-designer tests
 * unaided, and what axe-core must pass clean):
 *   - every control reachable and operable by Tab/Shift+Tab/Enter/Space/Arrow
 *   - visible focus ring, never suppressed
 *   - all controls have accessible names (aria-label) and roles
 *   - captions track is a real <track kind="captions"> AND a visible,
 *     resizable/recolourable overlay (some screen readers + low-vision
 *     users need both)
 *   - nothing relies on color alone
 */
(function () {
  "use strict";

  function init(container) {
    const videoId = container.dataset.bridgeVideo;
    const apiBase = container.dataset.bridgeApi || "";
    if (!videoId) {
      console.error("BridgePlayer: data-bridge-video is required");
      return;
    }

    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Accessible lesson player");

    // --- Player shell -----------------------------------------------
    const root = document.createElement("div");
    root.className = "bp-root";

    const video = document.createElement("video");
    video.className = "bp-video";
    video.setAttribute("tabindex", "0");
    video.setAttribute("preload", "metadata");
    // TODO: point at the actual media asset once the pipeline exposes it
    // video.src = `${apiBase}/videos/${videoId}/media`;

    // Captions track (real <track> for native AT support)
    const capTrack = document.createElement("track");
    capTrack.kind = "captions";
    capTrack.label = "English";
    capTrack.srclang = "en";
    capTrack.src = `${apiBase}/videos/${videoId}/captions?lang=en`;
    video.appendChild(capTrack);

    const capTrackAm = document.createElement("track");
    capTrackAm.kind = "captions";
    capTrackAm.label = "አማርኛ";
    capTrackAm.srclang = "am";
    capTrackAm.src = `${apiBase}/videos/${videoId}/captions?lang=am`;
    video.appendChild(capTrackAm);

    // Audio description (descriptions track; TODO: wire browser TTS or
    // pre-rendered audio fallback for browsers without AD support)
    const descTrack = document.createElement("track");
    descTrack.kind = "descriptions";
    descTrack.label = "Audio description";
    descTrack.srclang = "en";
    descTrack.src = `${apiBase}/videos/${videoId}/description-track`;
    video.appendChild(descTrack);

    root.appendChild(video);

    // --- Controls (all keyboard-operable, all labeled) ---------------
    const controls = document.createElement("div");
    controls.className = "bp-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Player controls");

    controls.appendChild(
      makeButton("Play or pause", "⏯", () => {
        video.paused ? video.play() : video.pause();
      })
    );
    controls.appendChild(
      makeButton("Increase caption size", "A+", () => resizeCaptions(1.1))
    );
    controls.appendChild(
      makeButton("Decrease caption size", "A-", () => resizeCaptions(0.9))
    );
    controls.appendChild(makeToggle("Toggle Ethiopian Sign Language window", toggleSignWindow));
    controls.appendChild(makeToggle("Toggle audio description", toggleAudioDescription));

    root.appendChild(controls);

    // --- Visible, recolourable/resizable caption overlay --------------
    // Some low-vision and Deaf+low-vision users need high-contrast,
    // large, user-controlled captions, not just the browser's native
    // rendering. TODO: render active cue text here, styled via CSS vars
    // (--bp-caption-size, --bp-caption-fg, --bp-caption-bg) that the
    // A+/A- and a colour-picker (TODO) control.
    const captionOverlay = document.createElement("div");
    captionOverlay.className = "bp-caption-overlay";
    captionOverlay.setAttribute("aria-live", "polite");
    root.appendChild(captionOverlay);

    // --- Sign language window (draggable + resizable, mouse AND keyboard) --
    // TODO: second <video> synced to `video.currentTime`, positioned
    // absolute over root, with arrow-key move/resize when focused
    // (document the keyboard shortcuts in the on-screen help, not just
    // a tooltip).
    const signWindow = document.createElement("video");
    signWindow.className = "bp-sign-window";
    signWindow.setAttribute("tabindex", "0");
    signWindow.setAttribute("aria-label", "Ethiopian Sign Language interpreter, movable and resizable");
    signWindow.hidden = true;
    root.appendChild(signWindow);

    // --- Synced transcript (plain scrollable text, screen-reader first) --
    const transcript = document.createElement("div");
    transcript.className = "bp-transcript";
    transcript.setAttribute("role", "region");
    transcript.setAttribute("aria-label", "Lesson transcript");
    transcript.tabIndex = 0;
    // TODO: fetch VTT, render as a list of <p data-start="..."> so a
    // click/Enter on a line seeks the video; highlight active line.
    root.appendChild(transcript);

    container.appendChild(root);

    function makeButton(label, text, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.textContent = text;
      b.addEventListener("click", onClick);
      return b;
    }

    function makeToggle(label, onClick) {
      const b = makeButton(label, label.split(" ")[0], onClick);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        const pressed = b.getAttribute("aria-pressed") === "true";
        b.setAttribute("aria-pressed", String(!pressed));
      });
      return b;
    }

    function resizeCaptions(factor) {
      const current = parseFloat(
        getComputedStyle(captionOverlay).getPropertyValue("--bp-caption-size") || "1"
      );
      captionOverlay.style.setProperty("--bp-caption-size", String(current * factor));
    }

    function toggleSignWindow() {
      signWindow.hidden = !signWindow.hidden;
    }

    function toggleAudioDescription() {
      // TODO: enable/disable the descriptions TextTrack, and if the
      // browser doesn't support it, fall back to a pre-rendered audio
      // ducking track from the pipeline.
      for (const t of video.textTracks) {
        if (t.kind === "descriptions") {
          t.mode = t.mode === "showing" ? "disabled" : "showing";
        }
      }
    }
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
