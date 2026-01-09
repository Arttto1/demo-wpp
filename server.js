const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

// Load env from ".env" (default) or "env" (when dotfiles are blocked in some environments)
for (const candidate of [
  path.join(__dirname, ".env"),
  path.join(__dirname, "env"),
]) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const app = express();
app.set("trust proxy", true);

// ---- Config (.env) ----
const PORT = Number(process.env.APP_PORT || process.env.PORT || 3001);
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_BUSINESS_ACCOUNT_ID =
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v19.0";

// ---- In-memory message log (demo only) ----
/** @type {Array<{id:string, ts:number, direction:"in"|"out", from?:string, to?:string, name?:string, text?:string, raw?:any}>} */
const MESSAGE_LOG = [];
const MAX_LOG = 200;

function pushLog(entry) {
  MESSAGE_LOG.unshift(entry);
  if (MESSAGE_LOG.length > MAX_LOG) MESSAGE_LOG.length = MAX_LOG;
}

function nowId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// ---- In-memory event log (debug) ----
/** @type {Array<{id:string, ts:number, kind:"info"|"warn"|"error", area:string, summary:string, data?:any}>} */
const EVENT_LOG = [];
const MAX_EVENTS = 300;
function pushEvent(entry) {
  EVENT_LOG.unshift(entry);
  if (EVENT_LOG.length > MAX_EVENTS) EVENT_LOG.length = MAX_EVENTS;
}

// ---- Middleware ----
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Log básico de TODA requisição (útil no Render)
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    const ip =
      (req.headers["x-forwarded-for"] &&
        String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
      req.ip;
    const summary = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`;
    console.log(summary);
    pushEvent({
      id: nowId("req"),
      ts: Date.now(),
      kind: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      area: "http",
      summary,
      data: { ip, ua: req.headers["user-agent"] || "" },
    });
  });
  next();
});

// Serve static site
app.use(express.static(path.join(__dirname, "public")));

// ---- Health ----
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    configured: {
      verifyToken: Boolean(VERIFY_TOKEN),
      whatsappAccessToken: Boolean(WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: Boolean(WHATSAPP_PHONE_NUMBER_ID),
      businessAccountId: Boolean(WHATSAPP_BUSINESS_ACCOUNT_ID),
    },
  });
});

// ---- Polling endpoint ----
app.get("/api/messages", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json({
    ok: true,
    messages: MESSAGE_LOG.slice(0, limit),
  });
});

// ---- Debug event log (polling) ----
app.get("/api/logs", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 80), 300);
  res.json({
    ok: true,
    events: EVENT_LOG.slice(0, limit),
  });
});

// ---- Send message via WhatsApp Cloud API ----
app.post("/api/send", async (req, res) => {
  try {
    const toRaw = String(req.body?.to || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!toRaw || !text) {
      return res
        .status(400)
        .json({ ok: false, error: "Campos obrigatórios: to, text" });
    }
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      return res.status(500).json({
        ok: false,
        error:
          "Config ausente: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID",
      });
    }

    // Normaliza: permite +55..., remove espaços e caracteres não-numéricos (mantém só dígitos)
    const to = toRaw.replace(/[^\d]/g, "");

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    };

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "info",
      area: "send",
      summary: `Enviando mensagem para ${to}`,
      data: { to, payload },
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    pushLog({
      id: nowId("out"),
      ts: Date.now(),
      direction: "out",
      to,
      text,
      raw: { status: resp.status, data },
    });

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: resp.ok ? "info" : "error",
      area: "send",
      summary: resp.ok
        ? `Mensagem enviada para ${to} (HTTP ${resp.status})`
        : `Falha ao enviar para ${to} (HTTP ${resp.status})`,
      data: { status: resp.status, response: data },
    });

    if (!resp.ok) {
      return res.status(502).json({
        ok: false,
        error: "Falha ao enviar pela Cloud API",
        details: data,
      });
    }

    return res.json({ ok: true, result: data });
  } catch (err) {
    pushLog({
      id: nowId("error"),
      ts: Date.now(),
      direction: "out",
      raw: { error: String(err) },
    });
    return res
      .status(500)
      .json({ ok: false, error: "Erro interno", details: String(err) });
  }
});

// ---- Templates (WhatsApp Business Management) ----
app.get("/api/templates", async (_req, res) => {
  try {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
      return res.status(500).json({
        ok: false,
        error:
          "Config ausente: WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID",
      });
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=50`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    });
    const data = await resp.json().catch(() => ({}));

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: resp.ok ? "info" : "error",
      area: "templates",
      summary: resp.ok
        ? "Listagem de templates OK"
        : `Falha ao listar templates (HTTP ${resp.status})`,
      data,
    });

    if (!resp.ok) {
      return res.status(502).json({
        ok: false,
        error: "Falha ao listar templates",
        details: data,
      });
    }

    return res.json({ ok: true, result: data });
  } catch (err) {
    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "error",
      area: "templates",
      summary: "Erro interno ao listar templates",
      data: { error: String(err) },
    });
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
});

app.post("/api/templates", async (req, res) => {
  try {
    if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
      return res.status(500).json({
        ok: false,
        error:
          "Config ausente: WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ACCOUNT_ID",
      });
    }

    const name = String(req.body?.name || "").trim();
    const language = String(req.body?.language || "pt_BR").trim();
    const category = String(req.body?.category || "MARKETING").trim();
    const bodyText = String(req.body?.bodyText || "").trim();

    if (!name || !bodyText) {
      return res.status(400).json({
        ok: false,
        error: "Campos obrigatórios: name, bodyText",
      });
    }

    // Payload mínimo aceito normalmente:
    // https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/
    const payload = {
      name,
      language,
      category,
      components: [{ type: "BODY", text: bodyText }],
    };

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "info",
      area: "templates",
      summary: `Criando template: ${name} (${language}/${category})`,
      data: payload,
    });

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: resp.ok ? "info" : "error",
      area: "templates",
      summary: resp.ok
        ? `Template enviado para aprovação: ${name}`
        : `Falha ao criar template (HTTP ${resp.status})`,
      data: { status: resp.status, response: data },
    });

    if (!resp.ok) {
      return res.status(502).json({
        ok: false,
        error: "Falha ao criar template",
        details: data,
      });
    }

    return res.json({ ok: true, result: data });
  } catch (err) {
    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "error",
      area: "templates",
      summary: "Erro interno ao criar template",
      data: { error: String(err) },
    });
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
});

// ---- Webhook verification (Meta) ----
// Meta calls GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && String(token) === String(VERIFY_TOKEN)) {
    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "info",
      area: "webhook",
      summary: "Verificação do webhook OK (Meta)",
      data: { mode, hasChallenge: Boolean(challenge) },
    });
    return res.status(200).send(String(challenge || ""));
  }
  pushEvent({
    id: nowId("evt"),
    ts: Date.now(),
    kind: "warn",
    area: "webhook",
    summary: "Verificação do webhook falhou (token inválido)",
    data: { mode, tokenMatch: String(token) === String(VERIFY_TOKEN) },
  });
  return res.sendStatus(403);
});

// ---- Webhook receiver (WhatsApp events) ----
app.post("/webhook", (req, res) => {
  // Always ack fast to avoid retries/timeouts.
  try {
    const body = req.body;

    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "info",
      area: "webhook",
      summary: "Evento recebido no webhook",
      data: body,
    });

    // Basic extraction for "messages" webhook payloads.
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    const contacts = value?.contacts;

    if (Array.isArray(messages) && messages.length > 0) {
      const msg = messages[0];
      const from = msg?.from;
      const name = contacts?.[0]?.profile?.name;
      const type = msg?.type;

      let text;
      if (type === "text") text = msg?.text?.body;
      else if (type === "button") text = msg?.button?.text;
      else if (type === "interactive") text = "(mensagem interativa)";
      else text = `(tipo ${type || "desconhecido"})`;

      pushLog({
        id: nowId("in"),
        ts: Date.now(),
        direction: "in",
        from,
        name,
        text,
        raw: body,
      });
    } else {
      // Status updates, delivery receipts, etc.
      pushLog({
        id: nowId("event"),
        ts: Date.now(),
        direction: "in",
        text: "(evento sem mensagem)",
        raw: body,
      });
    }
  } catch (err) {
    pushLog({
      id: nowId("event_error"),
      ts: Date.now(),
      direction: "in",
      raw: { error: String(err) },
    });
    pushEvent({
      id: nowId("evt"),
      ts: Date.now(),
      kind: "error",
      area: "webhook",
      summary: "Erro ao processar webhook",
      data: { error: String(err) },
    });
  }

  return res.sendStatus(200);
});

// ---- Simple SPA-ish fallback (optional) ----
app.get("/app", (_req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () => {
  console.log(`[demo] Running on http://localhost:${PORT}`);
});
