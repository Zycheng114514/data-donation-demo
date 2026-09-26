// Shared by the Port and DDM demo pages: shows "what the research server would have received".
// Nothing here sends data anywhere. The payload is rendered as tables (every array of objects found in it)
// plus a download of the complete JSON.
(function () {
  const MAX_ROWS = 50;
  const MAX_CELL = 160;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  const isRecord = (r) => r !== null && typeof r === "object" && !Array.isArray(r);
  const isTable = (v) => Array.isArray(v) && v.length > 0 && v.every(isRecord);

  // Every array of plain objects inside the payload, with the path that leads to it. An array whose objects
  // themselves hold tables (Port: [{"chatgpt_conversations": [...], "deleted row count": 14}]) is opened up;
  // the scalar values next to those inner tables are kept as a line of text.
  function findTables(value, path, out, depth) {
    if (depth > 4 || value === null || typeof value !== "object") return out;
    if (Array.isArray(value)) {
      if (isTable(value) && !value.some((r) => Object.values(r).some(isTable))) {
        out.push({ path: path || "(top level)", rows: value });
        return out;
      }
      value.forEach((v, i) => findTables(v, path + "[" + i + "]", out, depth + 1));
      return out;
    }
    const scalars = Object.entries(value).filter(([, v]) => v === null || typeof v !== "object");
    if (scalars.length && Object.values(value).some(isTable)) {
      out.push({ path: path || "(top level)", scalars });
    }
    for (const [k, v] of Object.entries(value)) findTables(v, path ? path + "." + k : k, out, depth + 1);
    return out;
  }

  function cell(v) {
    let s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL) + " …";
    return s;
  }

  function table(rows) {
    const cols = [];
    rows.slice(0, MAX_ROWS).forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
    const head = el("tr", {}, cols.map((c) => el("th", { text: c })));
    const body = rows.slice(0, MAX_ROWS).map((r) => el("tr", {}, cols.map((c) => el("td", { text: cell(r[c]) }))));
    return el("div", { class: "demo-table-wrap" }, [el("table", { class: "demo-table" }, [el("thead", {}, [head]), el("tbody", {}, body)])]);
  }

  function downloadButton(label, data, filename) {
    const btn = el("button", { type: "button", class: "demo-btn", text: label });
    btn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const a = el("a", { href: URL.createObjectURL(blob), download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
    return btn;
  }

  // title: heading; data: parsed payload; filename: for the download; note: optional sentence under the heading
  function render(container, title, data, filename, note) {
    const box = el("div", { class: "demo-payload" }, [el("h3", { text: title })]);
    if (note) box.appendChild(el("p", { class: "demo-muted", text: note }));
    const tables = findTables(data, "", [], 0);
    if (!tables.length) {
      box.appendChild(el("pre", { class: "demo-pre", text: JSON.stringify(data, null, 1).slice(0, 4000) }));
    }
    for (const t of tables) {
      if (t.scalars) {
        box.appendChild(el("p", { class: "demo-muted", text: t.path + ": " + t.scalars.map(([k, v]) => k + " = " + v).join("; ") }));
        continue;
      }
      const shown = Math.min(t.rows.length, MAX_ROWS);
      box.appendChild(el("p", { class: "demo-muted", text: t.path + ": " + t.rows.length + " row(s)" +
        (t.rows.length > shown ? ", first " + shown + " shown" : "") }));
      box.appendChild(table(t.rows));
    }
    box.appendChild(downloadButton("Download this as JSON", data, filename));
    container.appendChild(box);
  }

  window.DemoResult = { render, el };
})();
