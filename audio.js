/* VAS v1 audio — soft office bed + four one-shots.
 * Listens for named window events fired by game.js:
 *   vas:assign · vas:rest · vas:endday · vas:recruit
 * The game never depends on this file: no audio support, blocked autoplay,
 * or muted all leave the loop untouched.
 */
(() => {
  const PREF_KEY = "vas_audio_v1"; // separate from the game save
  const BASE = "audio/";
  const FILES = {
    bed: "bed_office",
    assign: "sfx_assign",
    rest: "sfx_rest",
    endday: "sfx_end_day",
    recruit: "sfx_recruit",
  };
  const BED_LEVEL = 0.55;
  const SFX_LEVEL = 0.85;
  const DUCK_LEVEL = 0.32;

  const probe = document.createElement("audio");
  const EXT = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? ".ogg" : ".mp3";
  const url = (key) => BASE + FILES[key] + EXT;

  let muted = false;
  try {
    muted = JSON.parse(localStorage.getItem(PREF_KEY) || "{}").muted === true;
  } catch { /* default unmuted */ }

  // ---- engine: Web Audio first, <audio> fallback (e.g. file:// where fetch is blocked)
  let ctx = null, master = null, bedGain = null, bedSrc = null;
  const buffers = {};
  let mode = "none"; // "webaudio" | "element" | "none"
  let loading = null;
  let bedEl = null;

  function decode(arr) {
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(arr, res, rej); // callback form for older Safari
      if (p && p.then) p.then(res, rej);
    });
  }

  async function loadWebAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("no AudioContext");
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedGain.connect(master);
    await Promise.all(
      Object.keys(FILES).map(async (k) => {
        const r = await fetch(url(k));
        if (!r.ok) throw new Error("fetch " + r.status);
        buffers[k] = await decode(await r.arrayBuffer());
      })
    );
    mode = "webaudio";
  }

  function initElements() {
    bedEl = new Audio(url("bed"));
    bedEl.loop = true;
    bedEl.volume = BED_LEVEL;
    mode = "element";
  }

  function load() {
    if (!loading) {
      loading = loadWebAudio().catch(() => {
        if (ctx) { try { ctx.close(); } catch {} ctx = null; }
        initElements();
      });
    }
    return loading;
  }

  function startBed() {
    if (muted || document.hidden) return;
    if (mode === "webaudio") {
      if (ctx.state === "suspended") ctx.resume();
      if (bedSrc) return;
      bedSrc = ctx.createBufferSource();
      bedSrc.buffer = buffers.bed;
      bedSrc.loop = true;
      bedSrc.connect(bedGain);
      bedSrc.start();
      const now = ctx.currentTime;
      bedGain.gain.cancelScheduledValues(now);
      bedGain.gain.setValueAtTime(0, now);
      bedGain.gain.linearRampToValueAtTime(BED_LEVEL, now + 2.0); // soft fade-in
    } else if (mode === "element") {
      bedEl.play().catch(() => {});
    }
  }

  function pauseAll() {
    if (mode === "webaudio" && ctx && ctx.state === "running") ctx.suspend();
    else if (mode === "element" && bedEl) bedEl.pause();
  }

  function duckBed(seconds) {
    if (mode !== "webaudio" || !bedSrc) return;
    const now = ctx.currentTime;
    const g = bedGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(DUCK_LEVEL, now + 0.05);
    g.linearRampToValueAtTime(BED_LEVEL, now + seconds + 0.4);
  }

  function play(key) {
    if (muted || !FILES[key] || key === "bed") return;
    if (mode === "webaudio" && buffers[key]) {
      if (ctx.state === "suspended") ctx.resume();
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = SFX_LEVEL;
      src.buffer = buffers[key];
      src.connect(g).connect(master);
      src.start();
      duckBed(buffers[key].duration);
    } else if (mode === "element") {
      const a = new Audio(url(key));
      a.volume = SFX_LEVEL;
      a.play().catch(() => {});
    }
  }

  // ---- mute toggle (top bar)
  const btn = document.getElementById("btn-mute");
  function renderMute() {
    if (!btn) return;
    btn.textContent = muted ? "🔇" : "♪";
    btn.setAttribute("aria-pressed", String(muted));
    btn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    btn.classList.toggle("muted", muted);
  }
  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ muted })); } catch {}
    renderMute();
    if (muted) pauseAll();
    else load().then(startBed);
  }
  if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); setMuted(!muted); });
  renderMute();

  // ---- unlock on user gesture (browser autoplay policy). Stays registered so a
  // context the browser suspended can be resumed synchronously inside a gesture (iOS).
  const GESTURES = ["pointerup", "touchend", "click", "keydown"];
  function onGesture() {
    if (muted) return;
    if (ctx && ctx.state === "suspended" && !document.hidden) ctx.resume();
    load().then(startBed);
  }
  GESTURES.forEach((ev) => window.addEventListener(ev, onGesture, true));

  // phone backgrounding: go quiet, come back soft
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseAll();
    else if (loading && !muted) loading.then(startBed);
  });

  // ---- named game events
  window.addEventListener("vas:assign", () => play("assign"));
  window.addEventListener("vas:rest", () => play("rest"));
  window.addEventListener("vas:endday", () => play("endday"));
  window.addEventListener("vas:recruit", () => play("recruit"));

  window.VASAudio = {
    play,
    setMuted,
    isMuted: () => muted,
    toggle: () => setMuted(!muted),
    status: () => ({ mode, muted, ext: EXT, bedPlaying: !!bedSrc && !!ctx && ctx.state === "running", ctx: ctx ? ctx.state : null }),
  };
})();
