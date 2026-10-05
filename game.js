(() => {
  const SAVE_KEY = "vas_shell_v1";
  const DEFAULT_STUDIO = "Generic Studio";

  const TALENT_DEFS = {
    pip: {
      id: "pip",
      name: "Pip",
      category: "Just Chatting",
      catIcon: "💬",
      toastLive: "Pip is live. Somehow.",
      basePay: 80,
      baseFans: 25,
    },
    miri: {
      id: "miri",
      name: "Miri",
      category: "Art",
      catIcon: "🎨",
      toastLive: "Miri is live. Bring a flowchart.",
      basePay: 90,
      baseFans: 30,
    },
  };

  /** @type {{
   *  studioName: string,
   *  day: number,
   *  money: number,
   *  fans: number,
   *  rosterCap: number,
   *  renamed: boolean,
   *  talents: Array<{id:string, energy:number, status:'idle'|'live'|'resting', seat:number|null}>
   * }} */
  let state;

  const el = {
    studio: document.getElementById("studio-name"),
    day: document.getElementById("day"),
    money: document.getElementById("money"),
    fans: document.getElementById("fans"),
    toast: document.getElementById("toast"),
    desks: document.getElementById("desks"),
    roster: document.getElementById("roster"),
    assign: document.getElementById("btn-assign"),
    rest: document.getElementById("btn-rest"),
    endday: document.getElementById("btn-endday"),
    modal: document.getElementById("rename-modal"),
    studioInput: document.getElementById("studio-input"),
    studioConfirm: document.getElementById("studio-confirm"),
    wanderers: document.getElementById("wanderers"),
  };

  let selectedId = null;
  let toastTimer = null;

  function defaultState() {
    return {
      studioName: DEFAULT_STUDIO,
      day: 1,
      money: 1200,
      fans: 340,
      rosterCap: 4,
      renamed: false,
      talents: [
        { id: "pip", energy: 72, status: "idle", seat: null },
        { id: "miri", energy: 90, status: "idle", seat: null },
      ],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.talents)) return defaultState();
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("save failed", e);
    }
  }

  function fmtMoney(n) {
    return "$" + Math.max(0, Math.round(n)).toLocaleString("en-US");
  }

  function fmtFans(n) {
    const v = Math.max(0, Math.round(n));
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k fans";
    return v + " fans";
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2600);
  }

  /** Named hooks for audio / future systems: vas:assign · vas:rest · vas:endday · vas:recruit */
  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent("vas:" + name, { detail }));
    } catch (e) {
      console.warn("emit failed", name, e);
    }
  }

  function talentById(id) {
    return state.talents.find((t) => t.id === id);
  }

  function freeSeatIndex() {
    const taken = new Set(state.talents.filter((t) => t.seat != null).map((t) => t.seat));
    for (let i = 0; i < state.rosterCap; i++) if (!taken.has(i)) return i;
    return null;
  }

  function seatOccupant(seatIdx) {
    return state.talents.find((t) => t.seat === seatIdx) || null;
  }

  function renderTop() {
    el.studio.textContent = state.studioName || DEFAULT_STUDIO;
    el.day.textContent = String(state.day);
    el.money.textContent = fmtMoney(state.money);
    el.fans.textContent = fmtFans(state.fans);
  }

  function renderDesks() {
    el.desks.innerHTML = "";
    for (let i = 0; i < state.rosterCap; i++) {
      const occ = seatOccupant(i);
      const desk = document.createElement("div");
      let cls = "desk open";
      if (occ) cls = "desk " + (occ.status === "live" ? "live" : "idle");
      desk.className = cls;

      desk.innerHTML = `
        <div class="desk-glow"></div>
        <div class="monitor"></div>
        <div class="desk-surface"></div>
      `;

      if (occ && occ.status === "live") {
        const def = TALENT_DEFS[occ.id];
        const chibi = document.createElement("div");
        chibi.className = "chibi " + occ.id;
        chibi.innerHTML = `<div class="headset"></div><div class="head"></div><div class="body"></div>`;
        desk.appendChild(chibi);
        const tag = document.createElement("div");
        tag.className = "desk-tag";
        tag.textContent = def.name + " · LIVE";
        desk.appendChild(tag);
      } else if (occ) {
        // seated idle rare — treat as open glow with name if somehow
        const def = TALENT_DEFS[occ.id];
        const tag = document.createElement("div");
        tag.className = "desk-tag";
        tag.textContent = def.name;
        desk.appendChild(tag);
      } else {
        const tag = document.createElement("div");
        tag.className = "desk-tag";
        tag.textContent = "Open";
        desk.appendChild(tag);
      }
      el.desks.appendChild(desk);
    }
  }

  function renderRoster() {
    el.roster.innerHTML = "";
    for (let i = 0; i < state.rosterCap; i++) {
      const t = state.talents[i];
      const card = document.createElement("div");
      if (!t) {
        card.className = "card open";
        card.textContent = "Open seat";
        el.roster.appendChild(card);
        continue;
      }
      const def = TALENT_DEFS[t.id];
      card.className = "card" + (selectedId === t.id ? " selected" : "");
      card.dataset.id = t.id;
      const energyClass = t.energy < 30 ? "energy low" : "energy";
      card.innerHTML = `
        <div class="avatar ${t.id}">${def.name[0]}</div>
        <div class="meta">
          <div class="name">${def.name}</div>
          <div class="cat"><span>${def.catIcon}</span> ${def.category}</div>
          <div class="status-pill ${t.status}">${t.status}</div>
        </div>
        <div class="${energyClass}">⚡ ${Math.round(t.energy)}%</div>
      `;
      card.addEventListener("click", () => {
        selectedId = selectedId === t.id ? null : t.id;
        renderRoster();
      });
      el.roster.appendChild(card);
    }
  }

  function renderWanderers() {
    // soft ambient dolls for empty-floor dollhouse feel
    el.wanderers.innerHTML = "";
    const spots = [
      { left: "8%", top: "55%" },
      { left: "70%", top: "40%" },
    ];
    // only show wanderers for idle (not live) talents not at desk
    const idleOffDesk = state.talents.filter((t) => t.status === "idle" && t.seat == null);
    idleOffDesk.forEach((t, idx) => {
      const spot = spots[idx % spots.length];
      const w = document.createElement("div");
      w.className = "wanderer";
      w.style.left = spot.left;
      w.style.top = spot.top;
      const color = t.id === "pip" ? "#ff9ec8" : "#b8a0ff";
      w.innerHTML = `<div class="head" style="background:${color}"></div><div class="body"></div>`;
      el.wanderers.appendChild(w);
    });
  }

  function render() {
    renderTop();
    renderDesks();
    renderRoster();
    renderWanderers();
  }

  function requireSelection() {
    if (!selectedId) {
      showToast("Tap a talent card first.");
      return null;
    }
    return talentById(selectedId);
  }

  function doAssign() {
    const t = requireSelection();
    if (!t) return;
    if (t.status === "live") {
      showToast(TALENT_DEFS[t.id].name + " is already live.");
      return;
    }
    if (t.energy < 15) {
      showToast(TALENT_DEFS[t.id].name + " is too tired — Rest first.");
      return;
    }
    if (t.seat == null) {
      const seat = freeSeatIndex();
      if (seat == null) {
        showToast("No free stream seats.");
        return;
      }
      t.seat = seat;
    }
    t.status = "live";
    save();
    render();
    showToast(TALENT_DEFS[t.id].toastLive);
    emit("assign", { id: t.id, seat: t.seat });
  }

  function doRest() {
    const t = requireSelection();
    if (!t) return;
    t.status = "resting";
    t.seat = null;
    t.energy = Math.min(100, t.energy + 35);
    save();
    render();
    showToast(TALENT_DEFS[t.id].name + " is recovering.");
    emit("rest", { id: t.id });
  }

  function doEndDay() {
    let moneyGain = 0;
    let fansGain = 0;
    const live = state.talents.filter((t) => t.status === "live");

    live.forEach((t) => {
      const def = TALENT_DEFS[t.id];
      const energyFactor = Math.max(0.35, t.energy / 100);
      moneyGain += Math.round(def.basePay * energyFactor);
      fansGain += Math.round(def.baseFans * energyFactor);
      t.energy = Math.max(5, t.energy - 22);
      t.status = "idle";
      t.seat = null;
    });

    // resting finish → idle with a bit more energy already applied on Rest
    state.talents.forEach((t) => {
      if (t.status === "resting") {
        t.status = "idle";
        t.energy = Math.min(100, t.energy + 10);
      } else if (t.status === "idle") {
        // soft idle recover
        t.energy = Math.min(100, t.energy + 5);
      }
    });

    if (live.length === 0) {
      moneyGain = 15;
      fansGain = 3;
    }

    state.money += moneyGain;
    state.fans += fansGain;
    state.day += 1;
    selectedId = null;
    save();
    render();
    showToast(`Day ${state.day - 1} · +${fansGain} fans · +$${moneyGain}`);
    emit("endday", { day: state.day - 1, fansGain, moneyGain });
  }

  function openRenameIfNeeded() {
    if (state.renamed) return;
    el.modal.classList.remove("hidden");
    el.modal.setAttribute("aria-hidden", "false");
    el.studioInput.value = state.studioName === DEFAULT_STUDIO ? "" : state.studioName;
    el.studioInput.focus();
  }

  function confirmRename() {
    const raw = (el.studioInput.value || "").trim();
    state.studioName = raw || DEFAULT_STUDIO;
    state.renamed = true;
    save();
    el.modal.classList.add("hidden");
    el.modal.setAttribute("aria-hidden", "true");
    render();
    showToast(`${state.studioName} · Pip & Miri on payroll. Two seats open.`);
  }

  // wire
  el.assign.addEventListener("click", doAssign);
  el.rest.addEventListener("click", doRest);
  el.endday.addEventListener("click", doEndDay);
  el.studioConfirm.addEventListener("click", confirmRename);
  el.studioInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmRename();
  });

  // boot
  state = load();
  render();
  openRenameIfNeeded();

  // expose for debug
  window.VAS = {
    reset() {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      selectedId = null;
      render();
      openRenameIfNeeded();
    },
    state: () => state,
    // Recruit has no button yet — call this from the future pick sheet (fires vas:recruit).
    recruited(id) {
      emit("recruit", { id });
    },
    emit,
  };
})();
