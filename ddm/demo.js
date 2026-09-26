// Static (GitHub Pages) stand-in for the DDM server behind the four participant pages.
// The pages themselves are DDM's own output (captured from the prototype by ../build.py), and the uploader and
// questionnaire are DDM's own front-end bundles. This script only replaces what the server does:
//   index.html (briefing)   the consent form would be POSTed    -> answer kept, go to donate.html or done.html
//   donate.html             the uploader POSTs a ZIP (post_data) -> unpacked and kept, go to questionnaire.html
//                           and processing logs                  -> kept
//   questionnaire.html      DDM renders donation-based texts     -> filled in from the kept donation
//                           answers are POSTed                   -> kept, go to done.html
//   done.html               DDM shows the debriefing             -> plus "what the server would have received"
// Everything is kept in sessionStorage of this tab. Nothing is sent anywhere.
(function () {
  const PAGE = document.currentScript.dataset.page;
  const KEY = "ddm-demo";
  const MARKER = /__DDM_DEMO_N_(\d+)__/;

  function load() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
  }
  function save(state) {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (_) { return false; }
  }
  function randomId(n) {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => abc[b % abc.length]).join("");
  }

  // sessionStorage holds about 5 MB. A large real export may not fit: keep the first rows then.
  function saveDonation(state, donation) {
    state.donationCounts = {};
    for (const [id, bp] of Object.entries(donation)) state.donationCounts[id] = (bp.extractedData || []).length;
    state.donation = donation;
    state.donationTruncatedTo = null;
    if (save(state)) return;
    for (const limit of [2000, 200, 20]) {
      const cut = {};
      for (const [id, bp] of Object.entries(donation)) cut[id] = { ...bp, extractedData: (bp.extractedData || []).slice(0, limit) };
      state.donation = cut;
      state.donationTruncatedTo = limit;
      if (save(state)) return;
    }
  }

  // The uploader sends its data as a ZIP holding data_donation.json (JSZip, DEFLATE). Read that one entry.
  async function readZipEntry(blob, name) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not a ZIP file");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad ZIP central directory");
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const fname = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
      if (fname === name) {
        const start = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
        const raw = buf.subarray(start, start + csize);
        if (method === 0) return new TextDecoder().decode(raw);
        if (method === 8) {
          const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          return await new Response(stream).text();
        }
        throw new Error("unsupported ZIP compression method " + method);
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(name + " not found in the ZIP");
  }

  // The DDM bundles call fetch(actionUrl, ...). build.py set those URLs to "demo:..." so they end up here.
  // The bundles only read .ok, .redirected and .url from the response.
  function installFetch(routes) {
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (routes[url]) return routes[url](init || {});
      return realFetch(input, init);
    };
  }
  const redirectTo = (url) => ({ ok: true, status: 200, statusText: "OK", redirected: true, url });
  const ok = () => ({ ok: true, status: 200, statusText: "OK", redirected: false, url: "" });

  if (PAGE === "briefing") {
    // A new run starts here: forget the previous one.
    const params = new URLSearchParams(window.location.search);
    const pid = (params.get("pid") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    const state = { pid, participantId: randomId(24), started: new Date().toISOString() };
    save(state);
    const form = document.querySelector("#ddm-participation-main form");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const choice = form.querySelector("input[name=briefing_consent]:checked");
      state.briefingConsent = choice ? choice.value : null;
      save(state);
      // Same as DDM: consent -> data donation step; no consent -> end page.
      window.location.href = state.briefingConsent === "1" ? "donate.html" : "done.html";
    });
  }

  if (PAGE === "donate") {
    const state = load();
    try {
      const cfg = JSON.parse(document.getElementById("config-data").textContent);
      state.blueprintNames = {};
      for (const up of cfg) for (const bp of up.blueprints || []) state.blueprintNames[bp.id] = bp.name;
      save(state);
    } catch (_) { /* names are only used for headings */ }
    installFetch({
      "demo:donate": async (init) => {
        try {
          const text = await readZipEntry(init.body.get("post_data"), "data_donation.json");
          saveDonation(state, JSON.parse(text));
          return redirectTo("questionnaire.html");
        } catch (err) {
          alert("Demo: could not read the donation (" + err.message + ").");
          return ok();
        }
      },
      "demo:log": async (init) => {
        try { (state.logs = state.logs || []).push(JSON.parse(init.body)); save(state); } catch (_) { /* ignore */ }
        return ok();
      },
    });
  }

  if (PAGE === "questionnaire") {
    const state = load();
    // DDM renders question texts on the server with the donated data (here: the number of donated messages)
    // and leaves out a blueprint-linked question when that blueprint has no successful donation.
    const qEl = document.getElementById("q-config-data");
    const questions = JSON.parse(qEl.textContent).filter((q) => {
      const m = String(q.text || "").match(MARKER);
      if (!m) return true;
      const bp = (state.donation || {})[m[1]];
      if (!bp || bp.status !== "DATA_EXTRACTED") return false;
      const n = (state.donationCounts || {})[m[1]] ?? (bp.extractedData || []).length;
      q.text = q.text.split(m[0]).join(String(n));
      return true;
    });
    qEl.textContent = JSON.stringify(questions);
    const svEl = document.getElementById("static-variables-data");
    const sv = JSON.parse(svEl.textContent);
    sv._url_pid = state.pid || null;
    sv._participant_id = state.participantId || null;
    sv._start_time = state.started || null;
    sv._briefing_consent = state.briefingConsent ?? null;
    svEl.textContent = JSON.stringify(sv);
    installFetch({
      "demo:submit": async (init) => {
        try { state.questionnaire = JSON.parse(init.body.get("post_data")).responses; } catch (_) { state.questionnaire = null; }
        save(state);
        return redirectTo("done.html");
      },
      "demo:progress": async () => ok(),
    });
  }

  if (PAGE === "done") {
    const state = load();
    const { el, render } = window.DemoResult;
    // DDM fills these into the debriefing text on the server ({{ participant_id }}, {{ url_parameter.pid }},
    // and a sentence that depends on donation_info.n_consent).
    const nConsent = Object.values(state.donation || {}).filter((bp) => bp.consent === true).length;
    const fill = { "participant-id": state.participantId || "", "pid": state.pid || "",
      "donation-note": nConsent === 0 ? "Prototype note: no data was donated in this session."
        : "Prototype note: your donation was received." };
    for (const [key, text] of Object.entries(fill)) {
      document.querySelectorAll('[data-demo="' + key + '"]').forEach((node) => { node.textContent = text; });
    }
    const panel = el("div", { class: "demo-panel" });
    panel.appendChild(el("h2", { text: "Demo: what the research server would have received" }));
    panel.appendChild(el("p", { class: "demo-muted", text:
      "In a real study DDM keeps this on its server: the donation encrypted in the database, the answers with the " +
      "participant record. Researchers download both in the project's Data Center. In this demo nothing was sent; " +
      "it exists only in this browser tab." }));
    const consent = { "1": "yes", "0": "no" }[state.briefingConsent] || "not recorded";
    panel.appendChild(el("p", { text: "Participant ID from the link (?pid=): " + (state.pid || "none") +
      "; DDM participant ID: " + (state.participantId || "none") + "; consent on the first page: " + consent + "." }));
    if (state.briefingConsent === "0") {
      panel.appendChild(el("p", { text: "Consent was declined, so DDM ends the study at this page and stores only that answer." }));
    }
    for (const [id, bp] of Object.entries(state.donation || {})) {
      const name = (state.blueprintNames || {})[id] || "blueprint " + id;
      const n = (state.donationCounts || {})[id] ?? (bp.extractedData || []).length;
      let note = "Consent to donate: " + (bp.consent === true ? "yes" : bp.consent === false ? "no" : "not given") +
        "; extraction status: " + bp.status + "; rows: " + n + ".";
      if (state.donationTruncatedTo) note += " Too large for this demo's browser storage: only the first " + state.donationTruncatedTo + " rows were kept.";
      if (bp.extractedData && bp.extractedData.length) {
        render(panel, "Donation - " + name, bp.extractedData, "ddm-demo-donation-" + id + ".json", note);
      } else {
        panel.appendChild(el("h3", { text: "Donation - " + name }));
        panel.appendChild(el("p", { class: "demo-muted", text: note + " No rows would have been stored." }));
      }
    }
    if (state.questionnaire) render(panel, "Questionnaire answers", state.questionnaire, "ddm-demo-answers.json",
      "Keys are DDM's question and item IDs; -99 marks a question left unanswered.");
    if (state.logs && state.logs.length) {
      const details = el("details", {}, [el("summary", { text: "Processing logs the uploader would have sent (" + state.logs.length + ")" })]);
      details.appendChild(el("pre", { class: "demo-pre", text: JSON.stringify(state.logs, null, 1).slice(0, 20000) }));
      panel.appendChild(details);
    }
    const again = el("a", { href: "index.html" + (state.pid ? "?pid=" + encodeURIComponent(state.pid) : ""),
      class: "demo-btn secondary", text: "Start again" });
    panel.appendChild(again);
    document.getElementById("ddm-participation-main").after(panel);
  }
})();
