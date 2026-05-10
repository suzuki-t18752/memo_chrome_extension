document.addEventListener("DOMContentLoaded", async () => {
  const openToggle = document.getElementById("openToggle");
  const clearBtn = document.getElementById("clearBtn");
  const resetPosBtn = document.getElementById("resetPosBtn");
  const count = document.getElementById("count");

  const DEFAULTS = { memo: "", isOpen: true };
  const state = await chrome.storage.local.get(DEFAULTS);

  openToggle.checked = !!state.isOpen;
  updateCount(state.memo);

  function updateCount(text) {
    count.textContent = `${(text || "").length}文字`;
  }

  openToggle.addEventListener("change", () => {
    chrome.storage.local.set({ isOpen: openToggle.checked });
  });

  resetPosBtn.addEventListener("click", () => {
    chrome.storage.local.set({
      x: 20,
      y: 20,
      width: 320,
      height: 320,
      isOpen: true,
    });
    openToggle.checked = true;
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm("メモを完全に削除します。よろしいですか？")) return;
    chrome.storage.local.set({ memo: "" });
    updateCount("");
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.memo) updateCount(changes.memo.newValue ?? "");
    if (changes.isOpen !== undefined) openToggle.checked = !!changes.isOpen.newValue;
  });
});
