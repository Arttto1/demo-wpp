const $ = (id) => document.getElementById(id);

const eventsEl = $("events");
const refreshBtn = $("refreshBtn");
let pollingTimer = null;
let lastRenderKey = "";

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function render(events) {
  const key = JSON.stringify(events.map((e) => [e.id, e.ts]));
  if (key === lastRenderKey) return;
  lastRenderKey = key;

  if (!events.length) {
    eventsEl.innerHTML =
      '<div class="muted small">Nenhum evento ainda.</div>';
    return;
  }

  eventsEl.innerHTML = events
    .map((e) => {
      const kind = e.kind || "info";
      const pillClass =
        kind === "error" ? "pill in" : kind === "warn" ? "pill out" : "pill out";
      const pillText =
        kind === "error" ? "Erro" : kind === "warn" ? "Aviso" : "Info";
      const area = e.area || "server";
      const summary = e.summary || "";
      const data = e.data ? JSON.stringify(e.data, null, 2) : "";
      return `
        <div class="item">
          <div class="item__top">
            <div class="${pillClass}">${pillText}</div>
            <div class="meta">
              <span>${escapeHtml(fmtTime(e.ts))}</span>
              <span>Área: ${escapeHtml(area)}</span>
            </div>
          </div>
          <div class="text">${escapeHtml(summary)}</div>
          ${
            data
              ? `<details style="margin-top:10px;">
                   <summary class="muted small" style="cursor:pointer;">Ver JSON</summary>
                   <pre class="muted small" style="white-space:pre;overflow:auto;margin:10px 0 0 0; padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(0,0,0,.18);">${escapeHtml(
                     data
                   )}</pre>
                 </details>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

async function load() {
  try {
    const r = await fetch("/api/logs?limit=120");
    const data = await r.json();
    if (!data?.ok) throw new Error("not ok");
    render(data.events || []);
  } catch (e) {
    eventsEl.innerHTML =
      '<div class="muted small">Falha ao carregar logs. Verifique se o servidor está rodando.</div>';
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(load, 2000);
}

refreshBtn?.addEventListener("click", load);

load();
startPolling();


