// Static (GitHub Pages) version of port-d3i/host/static/host.js.
// The bridge is unchanged: embed the task in an iframe, answer its "app-loaded" message with
// {action: "live-init", locale} plus a MessageChannel port, and handle the task's commands.
// One difference: CommandSystemDonate is not POSTed to a server. The donation is kept in this page,
// answered with DonateSuccess, and shown on the last step ("what the research server would have received").
(function () {
  const LOCALE = "en";
  const frame = document.getElementById("task-frame");
  const statusEl = document.getElementById("task-status");
  const startBtn = document.getElementById("start-btn");
  const consentBox = document.getElementById("consent-box");

  // Participant ID: taken from ?pid=... (e.g. passed on by Qualtrics or a panel), otherwise generated.
  const params = new URLSearchParams(window.location.search);
  const cleaned = (params.get("pid") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const participantId = cleaned || "p-" + Math.random().toString(36).slice(2, 10);
  document.getElementById("pid-label").textContent = participantId;

  let channel = null;
  const donations = [];

  function show(step) {
    for (const id of ["step-intro", "step-task", "step-done"]) {
      document.getElementById(id).hidden = id !== step;
    }
    window.scrollTo(0, 0);
  }

  function reply(message) {
    if (channel) channel.port1.postMessage(message);
  }

  function donate(command) {
    let data = command.json_string;
    try { data = JSON.parse(command.json_string); } catch (_) { /* keep the string */ }
    donations.push({ key: command.key, data });
    reply({ __type__: "DonateSuccess", key: command.key, status: 200 });
  }

  function finish() {
    const out = document.getElementById("demo-result");
    out.textContent = "";
    const { el, render } = window.DemoResult;
    out.appendChild(el("h2", { text: "Demo: what the research server would have received" }));
    out.appendChild(el("p", { class: "demo-muted", text:
      "In a real study the task sends each donation below to the host platform (Eyra's Next, or the prototype's " +
      "mini host), which stores it with the participant ID. In this demo nothing was sent; it exists only in this tab." }));
    out.appendChild(el("p", { class: "demo-muted", text: "Participant ID: " + participantId + " - donations: " + donations.length }));
    if (!donations.length) {
      out.appendChild(el("p", { text: "Nothing was donated." }));
    }
    donations.forEach((d, i) => render(out, "Donation " + (i + 1) + " (key: " + d.key + ")", d.data,
      "port-demo-" + participantId + "-" + (i + 1) + ".json"));
    const again = el("a", { href: "./?pid=" + encodeURIComponent(participantId), class: "demo-btn secondary", text: "Start again" });
    out.appendChild(again);
    out.hidden = false;
    show("step-done");
  }

  function handleCommand(event) {
    const command = event.data || {};
    switch (command.__type__) {
      case "CommandSystemDonate": donate(command); break;
      case "CommandSystemExit": finish(); break;
      case "CommandSystemEvent":
        if (command.name === "initialized") statusEl.hidden = true;
        break;
      case "CommandSystemLog": console.log("[task log]", command.level, command.message); break;
      default: console.log("[host] unhandled message", command);
    }
  }

  function initChannel(fromEvent) {
    if (fromEvent === "onload" && channel) return;   // same guard as Next: only app-loaded may replace the channel
    if (!frame.contentWindow) return;
    channel = new MessageChannel();
    channel.port1.onmessage = handleCommand;
    frame.contentWindow.postMessage({ action: "live-init", locale: LOCALE }, "*", [channel.port2]);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || !event.data) return;
    if (event.data.action === "app-loaded") initChannel("app-loaded");
    else if (event.data.action === "resize") frame.style.height = Math.max(720, event.data.height + 40) + "px";
  });
  frame.addEventListener("load", () => initChannel("onload"));

  consentBox.addEventListener("change", () => { startBtn.disabled = !consentBox.checked; });
  startBtn.addEventListener("click", () => {
    show("step-task");
    frame.src = "task/index.html";
  });
})();
