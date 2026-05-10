(async function () {
  if (window.top !== window) return;
  if (document.getElementById("memo-ext-host")) return;

  const MIN_WIDTH = 240;
  const MIN_HEIGHT = 180;
  const DEFAULT_WIDTH = 320;
  const DEFAULT_HEIGHT = 320;

  const DEFAULTS = {
    memo: "",
    isOpen: true,
    x: null,
    y: null,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };

  const stored = await chrome.storage.local.get(DEFAULTS);
  const state = { ...DEFAULTS, ...stored };

  if (state.x === null || state.y === null) {
    state.x = Math.max(20, window.innerWidth - state.width - 20);
    state.y = 20;
  }
  clampStateToViewport();

  let lastWrittenMemo = state.memo;

  const host = document.createElement("div");
  host.id = "memo-ext-host";
  host.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

      .panel {
        position: fixed;
        z-index: 2147483646;
        background: #fffceb;
        border: 1px solid #d4c87a;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        background: #f5e9a8;
        border-bottom: 1px solid #d4c87a;
        gap: 8px;
        flex-shrink: 0;
        cursor: move;
        user-select: none;
      }
      .title { font-size: 12px; font-weight: 600; color: #6b5a1f; }

      .closer {
        width: 26px;
        height: 26px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        color: #555;
        border-radius: 4px;
      }
      .closer:hover { background: rgba(0, 0, 0, 0.08); }

      textarea {
        flex: 1;
        width: 100%;
        border: none;
        outline: none;
        resize: none;
        padding: 10px;
        background: transparent;
        font-size: 14px;
        line-height: 1.5;
        color: #222;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }

      .footer {
        padding: 4px 8px;
        font-size: 11px;
        color: #888;
        text-align: right;
        background: #faf3d0;
        border-top: 1px solid #e6d98a;
        flex-shrink: 0;
      }

      /* 8 resize handles */
      .resizer { position: absolute; z-index: 2; }
      .resizer.n  { top: -3px;    left: 8px;   right: 8px;  height: 6px; cursor: ns-resize; }
      .resizer.s  { bottom: -3px; left: 8px;   right: 8px;  height: 6px; cursor: ns-resize; }
      .resizer.e  { right: -3px;  top: 8px;    bottom: 8px; width: 6px;  cursor: ew-resize; }
      .resizer.w  { left: -3px;   top: 8px;    bottom: 8px; width: 6px;  cursor: ew-resize; }
      .resizer.nw { top: -4px;    left: -4px;  width: 12px; height: 12px; cursor: nwse-resize; }
      .resizer.ne { top: -4px;    right: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
      .resizer.sw { bottom: -4px; left: -4px;  width: 12px; height: 12px; cursor: nesw-resize; }
      .resizer.se { bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: nwse-resize; }

      /* open/close visibility */
      .root[data-open="false"] .panel { display: none; }
    </style>

    <div class="root" data-open="${state.isOpen}">
      <div class="panel">
        <div class="header">
          <span class="title">📝 メモ</span>
          <button class="closer" title="閉じる">×</button>
        </div>
        <textarea placeholder="メモを入力..."></textarea>
        <div class="footer"><span class="status">保存済み</span></div>
        <div class="resizer n"  data-dir="n"></div>
        <div class="resizer s"  data-dir="s"></div>
        <div class="resizer e"  data-dir="e"></div>
        <div class="resizer w"  data-dir="w"></div>
        <div class="resizer nw" data-dir="nw"></div>
        <div class="resizer ne" data-dir="ne"></div>
        <div class="resizer sw" data-dir="sw"></div>
        <div class="resizer se" data-dir="se"></div>
      </div>
    </div>
  `;

  const root = shadow.querySelector(".root");
  const panel = shadow.querySelector(".panel");
  const header = shadow.querySelector(".header");
  const textarea = shadow.querySelector("textarea");
  const closer = shadow.querySelector(".closer");
  const status = shadow.querySelector(".status");

  textarea.value = state.memo;
  applyGeometry();

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function clampStateToViewport() {
    state.width = clamp(state.width, MIN_WIDTH, Math.max(MIN_WIDTH, window.innerWidth));
    state.height = clamp(state.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, window.innerHeight));
    state.x = clamp(state.x ?? 20, 0, Math.max(0, window.innerWidth - 60));
    state.y = clamp(state.y ?? 20, 0, Math.max(0, window.innerHeight - 40));
  }

  function applyGeometry() {
    panel.style.left = state.x + "px";
    panel.style.top = state.y + "px";
    panel.style.width = state.width + "px";
    panel.style.height = state.height + "px";
  }

  let saveTimer = null;
  function scheduleSave() {
    status.textContent = "編集中...";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const value = textarea.value;
    if (value === lastWrittenMemo) {
      status.textContent = "保存済み";
      return;
    }
    lastWrittenMemo = value;
    await chrome.storage.local.set({ memo: value });
    status.textContent = "保存済み";
  }

  textarea.addEventListener("input", scheduleSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) flushSave();
  });
  window.addEventListener("beforeunload", () => {
    if (saveTimer) flushSave();
  });

  closer.addEventListener("click", async () => {
    if (saveTimer) await flushSave();
    root.dataset.open = "false";
    await chrome.storage.local.set({ isOpen: false });
  });

  let drag = null;

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    drag = {
      type: "move",
      mx: e.clientX,
      my: e.clientY,
      x: state.x,
      y: state.y,
    };
    document.body.style.userSelect = "none";
  });

  shadow.querySelectorAll(".resizer").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      drag = {
        type: "resize",
        dir: el.dataset.dir,
        mx: e.clientX,
        my: e.clientY,
        x: state.x,
        y: state.y,
        w: state.width,
        h: state.height,
      };
      document.body.style.userSelect = "none";
    });
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.mx;
    const dy = e.clientY - drag.my;

    if (drag.type === "move") {
      state.x = clamp(drag.x + dx, 0, Math.max(0, window.innerWidth - 60));
      state.y = clamp(drag.y + dy, 0, Math.max(0, window.innerHeight - 40));
    } else {
      const dir = drag.dir;
      let nx = drag.x, ny = drag.y, nw = drag.w, nh = drag.h;
      if (dir.includes("e")) nw = drag.w + dx;
      if (dir.includes("w")) { nw = drag.w - dx; nx = drag.x + dx; }
      if (dir.includes("s")) nh = drag.h + dy;
      if (dir.includes("n")) { nh = drag.h - dy; ny = drag.y + dy; }

      if (nw < MIN_WIDTH) {
        if (dir.includes("w")) nx = drag.x + (drag.w - MIN_WIDTH);
        nw = MIN_WIDTH;
      }
      if (nh < MIN_HEIGHT) {
        if (dir.includes("n")) ny = drag.y + (drag.h - MIN_HEIGHT);
        nh = MIN_HEIGHT;
      }
      state.x = clamp(nx, 0, window.innerWidth);
      state.y = clamp(ny, 0, window.innerHeight);
      state.width = Math.round(nw);
      state.height = Math.round(nh);
    }
    applyGeometry();
  });

  document.addEventListener("mouseup", () => {
    if (!drag) return;
    drag = null;
    document.body.style.userSelect = "";
    chrome.storage.local.set({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
    });
  });

  window.addEventListener("resize", () => {
    clampStateToViewport();
    applyGeometry();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.memo) {
      const newValue = changes.memo.newValue ?? "";
      if (newValue !== lastWrittenMemo && newValue !== textarea.value) {
        lastWrittenMemo = newValue;
        if (shadow.activeElement !== textarea) textarea.value = newValue;
      }
    }

    if (changes.isOpen !== undefined) {
      const open = String(!!changes.isOpen.newValue);
      if (root.dataset.open !== open) root.dataset.open = open;
    }

    let geomChanged = false;
    for (const key of ["x", "y", "width", "height"]) {
      if (changes[key] && typeof changes[key].newValue === "number") {
        state[key] = changes[key].newValue;
        geomChanged = true;
      }
    }
    if (geomChanged) {
      clampStateToViewport();
      applyGeometry();
    }
  });
})();
