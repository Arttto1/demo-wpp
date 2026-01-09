const $ = (id) => document.getElementById(id);

const healthBadge = $("healthBadge");
const sendForm = $("sendForm");
const sendStatus = $("sendStatus");
const messagesEl = $("messages");
const refreshBtn = $("refreshBtn");
const demoFillBtn = $("demoFill");
const templateSelect = $("templateSelect");
const reloadTemplatesBtn = $("reloadTemplates");
const modeNote = $("modeNote");
const freeBox = $("freeBox");
const templateBox = $("templateBox");

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
    if (okAll) setBadge("ok", "Conectado");
    else setBadge("warn", "Configuração incompleta");
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
      setStatus("bad", `${err}${data?.details ? " (veja detalhes em Atividade)" : ""}`);
      console.warn("send error:", data);
      return;
    }
    setStatus("ok", "Mensagem enviada.");
    await loadMessages();
  } catch (e) {
    setStatus("bad", `Erro: ${String(e)}`);
  }
}

async function sendTemplate(to, templateName, language, vars) {
  setStatus("", "Enviando modelo…");
  try {
    const r = await fetch("/api/send-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        templateName,
        language,
        variables: vars,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      const err = data?.error || "Falha ao enviar";
      setStatus("bad", `${err}${data?.details ? " (veja detalhes em Atividade)" : ""}`);
      console.warn("send-template error:", data);
      return;
    }
    setStatus("ok", "Modelo enviado.");
    await loadMessages();
  } catch (e) {
    setStatus("bad", `Erro: ${String(e)}`);
  }
}

function getMode() {
  const el = document.querySelector('input[name="sendMode"]:checked');
  return el ? el.value : "free";
}

function applyModeUI() {
  const mode = getMode();
  if (mode === "template") {
    freeBox.classList.add("hidden");
    templateBox.classList.remove("hidden");
    modeNote.innerHTML =
      "<strong>Modelo</strong>: usado para iniciar conversa com um contato fora da janela de 24h. " +
      "A mensagem é enviada usando um modelo aprovado.";
  } else {
    templateBox.classList.add("hidden");
    freeBox.classList.remove("hidden");
    modeNote.innerHTML =
      "<strong>Mensagem livre</strong>: pode ser enviada para responder um contato dentro da janela de 24h desde a última mensagem do cliente. " +
      "Para iniciar conversa fora da janela, use <strong>Modelo</strong>.";
  }
}

async function loadTemplates() {
  if (!templateSelect) return;
  templateSelect.innerHTML = `<option>Carregando...</option>`;
  try {
    const r = await fetch("/api/templates");
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) throw new Error(data?.error || "Falha ao listar");
    const items = data.result?.data || [];
    if (!items.length) {
      templateSelect.innerHTML = `<option value="">Nenhum modelo encontrado</option>`;
      return;
    }
    templateSelect.innerHTML = items
      .map((t) => {
        const name = t.name || "";
        const status = t.status || "";
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${status ? ` — ${escapeHtml(status)}` : ""}</option>`;
      })
      .join("");
  } catch (e) {
    templateSelect.innerHTML = `<option value="">Falha ao carregar (veja Atividade)</option>`;
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(loadMessages, 2000);
}

sendForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const to = $("toInput").value;
  const mode = getMode();
  if (mode === "template") {
    const templateName = templateSelect?.value || "";
    const language = $("templateLang")?.value || "pt_BR";
    const varsRaw = $("templateVars")?.value || "";
    const vars = varsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await sendTemplate(to, templateName, language, vars);
  } else {
    const text = $("textInput").value;
    await sendMessage(to, text);
  }
});

refreshBtn?.addEventListener("click", loadMessages);
demoFillBtn?.addEventListener("click", () => {
  const mode = getMode();
  if (mode === "template") {
    if ($("templateVars") && !$("templateVars").value) {
      $("templateVars").value = "João\n10/01 às 15:00";
    }
  } else {
    if (!$("textInput").value) $("textInput").value = "Olá! Como posso ajudar?";
  }
});

document.querySelectorAll('input[name="sendMode"]').forEach((el) => {
  el.addEventListener("change", applyModeUI);
});
reloadTemplatesBtn?.addEventListener("click", loadTemplates);

// init
loadHealth();
loadMessages();
startPolling();
applyModeUI();
loadTemplates();
