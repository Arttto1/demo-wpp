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

// ---- Middleware ----
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

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

    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    };

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

// ---- Webhook verification (Meta) ----
// Meta calls GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && String(token) === String(VERIFY_TOKEN)) {
    return res.status(200).send(String(challenge || ""));
  }
  return res.sendStatus(403);
});

// ---- Webhook receiver (WhatsApp events) ----
app.post("/webhook", (req, res) => {
  // Always ack fast to avoid retries/timeouts.
  try {
    const body = req.body;

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
