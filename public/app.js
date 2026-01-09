const $ = (id) => document.getElementById(id);

const healthBadge = $("healthBadge");
const sendForm = $("sendForm");
const sendStatus = $("sendStatus");
const messagesEl = $("messages");
const refreshBtn = $("refreshBtn");
const demoFillBtn = $("demoFill");

let pollingTimer = null;
let lastRenderKey = "";

function setBadge(kind, text) {
  healthBadge.classList.remove("ok", "bad", "warn");
  if (kind) healthBadge.classList.add(kind);
  healthBadge.textContent = text;
}

function setStatus(kind, text) {
  sendStatus.classList.remove("ok", "bad");
  if (kind) sendStatus.classList.add(kind);
  sendStatus.textContent = text || "";
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadHealth() {
  try {
    const r = await fetch("/api/health");
    const data = await r.json();
    if (!data?.ok) throw new Error("health not ok");
    const cfg = data.configured || {};
    const okAll =
      cfg.verifyToken && cfg.whatsappAccessToken && cfg.phoneNumberId;
    if (okAll) setBadge("ok", "API configurada");
    else setBadge("warn", "Faltam variáveis no .env");
  } catch (e) {
    setBadge("bad", "Erro no servidor");
  }
}

function renderMessages(items) {
  const key = JSON.stringify(items.map((m) => [m.id, m.ts]));
  if (key === lastRenderKey) return;
  lastRenderKey = key;

  if (!items.length) {
    messagesEl.innerHTML = `<div class="muted small">Nenhuma mensagem ainda. Envie uma mensagem ou mande algo para o WhatsApp conectado.</div>`;
    return;
  }

  messagesEl.innerHTML = items
    .map((m) => {
      const dir = m.direction === "out" ? "out" : "in";
      const pillText = dir === "out" ? "Enviada" : "Recebida";
      const peer =
        dir === "out"
          ? m.to
            ? `Para: ${m.to}`
            : "Para: —"
          : m.from
          ? `De: ${m.from}`
          : "De: —";
      const who = m.name ? `Contato: ${m.name}` : "";
      const text = m.text || "";
      return `
        <div class="item">
          <div class="item__top">
            <div class="pill ${dir}">${pillText}</div>
            <div class="meta">
              <span>${escapeHtml(fmtTime(m.ts))}</span>
              <span>${escapeHtml(peer)}</span>
              ${who ? `<span>${escapeHtml(who)}</span>` : ""}
            </div>
          </div>
          <div class="text">${escapeHtml(text)}</div>
        </div>
      `;
    })
    .join("");
}

async function loadMessages() {
  try {
    const r = await fetch("/api/messages?limit=60");
    const data = await r.json();
    if (!data?.ok) throw new Error("messages not ok");
    renderMessages(data.messages || []);
  } catch (e) {
    messagesEl.innerHTML = `<div class="muted small">Falha ao carregar mensagens. Verifique se o servidor está rodando.</div>`;
  }
}

async function sendMessage(to, text) {
  setStatus("", "Enviando…");
  try {
    const r = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      const err = data?.error || "Falha ao enviar";
      setStatus("bad", `${err}${data?.details ? " (veja console)" : ""}`);
      console.warn("send error:", data);
      return;
    }
    setStatus("ok", "Mensagem enviada. Mostre o WhatsApp recebendo no vídeo.");
    await loadMessages();
  } catch (e) {
    setStatus("bad", `Erro: ${String(e)}`);
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(loadMessages, 2000);
}

sendForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const to = $("toInput").value;
  const text = $("textInput").value;
  await sendMessage(to, text);
});

refreshBtn?.addEventListener("click", loadMessages);
demoFillBtn?.addEventListener("click", () => {
  if (!$("textInput").value)
    $("textInput").value =
      "Olá! Teste de envio pela WhatsApp Cloud API (Meta).";
});

// init
loadHealth();
loadMessages();
startPolling();
