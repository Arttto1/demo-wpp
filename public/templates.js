const $ = (id) => document.getElementById(id);

const tplForm = $("tplForm");
const tplStatus = $("tplStatus");
const tplList = $("tplList");
const tplRefresh = $("tplRefresh");
const tplFill = $("tplFill");

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(kind, text) {
  tplStatus.classList.remove("ok", "bad");
  if (kind) tplStatus.classList.add(kind);
  tplStatus.textContent = text || "";
}

function renderTemplates(result) {
  const items = result?.data || [];
  if (!items.length) {
    tplList.innerHTML =
      '<div class="muted small">Nenhum template retornado (ou sem permissão/configuração).</div>';
    return;
  }

  tplList.innerHTML = items
    .map((t) => {
      const name = t.name || "(sem nome)";
      const status = t.status || "(sem status)";
      const category = t.category || "";
      const language = t.language || "";
      return `
        <div class="item">
          <div class="item__top">
            <div class="pill out">${escapeHtml(status)}</div>
            <div class="meta">
              ${category ? `<span>${escapeHtml(category)}</span>` : ""}
              ${language ? `<span>${escapeHtml(language)}</span>` : ""}
            </div>
          </div>
          <div class="text"><strong>${escapeHtml(name)}</strong></div>
        </div>
      `;
    })
    .join("");
}

async function loadTemplates() {
  try {
    const r = await fetch("/api/templates");
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      tplList.innerHTML =
        '<div class="muted small">Falha ao listar templates. Veja /logs.html para detalhes.</div>';
      console.warn("templates list error:", data);
      return;
    }
    renderTemplates(data.result);
  } catch (e) {
    tplList.innerHTML =
      '<div class="muted small">Erro ao listar templates. Verifique o servidor.</div>';
  }
}

async function createTemplate({ name, language, category, bodyText }) {
  setStatus("", "Criando template…");
  try {
    const r = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, language, category, bodyText }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.ok) {
      setStatus("bad", (data?.error || "Falha ao criar") + " (veja Logs)");
      console.warn("template create error:", data);
      return;
    }
    setStatus("ok", "Template criado/enviado para aprovação. Veja status na lista.");
    await loadTemplates();
  } catch (e) {
    setStatus("bad", `Erro: ${String(e)}`);
  }
}

tplForm?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("tplName").value.trim();
  const language = $("tplLang").value.trim();
  const category = $("tplCategory").value.trim();
  const bodyText = $("tplBody").value.trim();
  await createTemplate({ name, language, category, bodyText });
});

tplRefresh?.addEventListener("click", loadTemplates);
tplFill?.addEventListener("click", () => {
  if (!$("tplName").value) $("tplName").value = "confirmacao_agendamento";
  if (!$("tplBody").value)
    $("tplBody").value =
      "Olá {{1}}, sua visita está confirmada para {{2}}.\nResponder SIM para confirmar.";
});

setStatus("", "Pronto. Configure WABA/token e crie seu template.");
loadTemplates();


