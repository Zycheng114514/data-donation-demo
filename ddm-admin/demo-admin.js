// Loaded at the end of every page of the DDM researcher-interface snapshot (see ../../capture_admin.py).
// The pages are DDM's own, saved from a throwaway instance. Without the server, three things are replaced:
// forms are not submitted, links to pages that were left out do nothing, and scripts that would call the server
// (e.g. "delete data") get an explanation instead. The two Data Center downloads work: they point to CSV files
// saved at capture time.
(function () {
  function note(text) {
    let box = document.getElementById("demo-admin-note");
    if (!box) {
      box = document.createElement("div");
      box.id = "demo-admin-note";
      box.setAttribute("role", "status");
      box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));" +
        "background:#1b1f24;color:#fff;padding:.75rem 1rem;border-radius:8px;font:14px/1.45 system-ui,-apple-system,sans-serif;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:99999";
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.hidden = false;
    clearTimeout(note.timer);
    note.timer = setTimeout(() => { box.hidden = true; }, 5000);
  }

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    note("Demo: nothing is saved. In DDM this form stores the setting on the server.");
  }, true);

  document.addEventListener("click", (event) => {
    const off = event.target.closest("[data-demo-off]");
    if (off) {
      event.preventDefault();
      note("Demo: this page is not part of the snapshot (delete, import, export, copy, logs, remote-access tokens and log-out are left out).");
    }
  }, true);

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/\.csv(\?|$)/.test(url)) return realFetch(input, init);
    note("Demo: this action needs the DDM server and is switched off here.");
    return Promise.reject(new Error("switched off in the static demo"));
  };
})();
