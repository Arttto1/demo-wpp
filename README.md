# Demo WhatsApp Cloud API (Meta) — site simples para evidência em vídeo

Este projeto é um **demo real** (mínimo) para:

- **Enviar mensagem** via **WhatsApp Cloud API** oficial (Meta)
- **Receber eventos** via **Webhook** (mensagens recebidas/status)
- Mostrar tudo num **painel web** com **polling** (sem websocket)
- Ter páginas públicas de **Política de Privacidade** e **Termos**

> Observação: isso **não** é o seu sistema principal; é um demo para gravação de vídeo e validação de integração.

## Requisitos

- Node.js **18+**
- Uma configuração válida do WhatsApp Cloud API no **Meta for Developers**

## Como rodar local

1) Instale dependências:

```bash
npm install
```

2) Crie um arquivo `env` (ou `.env` se o seu ambiente permitir) a partir do `env.example` e preencha:

- `VERIFY_TOKEN` (qualquer string)
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA — necessário para templates)

3) Suba o servidor:

```bash
npm run start
```

Abra:

- Painel: `http://localhost:3000/`
- Privacidade: `http://localhost:3000/privacy.html`
- Termos: `http://localhost:3000/terms.html`

## Endpoints (para referência)

- `GET /api/health` status e se as variáveis de ambiente estão preenchidas
- `GET /api/messages` últimas mensagens (polling)
- `POST /api/send` envia texto (`{ "to": "+5511999999999", "text": "..." }`)
- `GET /api/templates` lista templates (requer `WHATSAPP_BUSINESS_ACCOUNT_ID`)
- `POST /api/templates` cria template (requer `WHATSAPP_BUSINESS_ACCOUNT_ID`)
- `GET /webhook` verificação do webhook (Meta)
- `POST /webhook` recebimento de eventos
- `GET /api/logs` logs do servidor (envio/webhook/templates)

## Configurando o Webhook no Meta

No seu app em `developers.facebook.com`:

- Configure a URL do webhook apontando para o seu servidor **público** (HTTPS).
  - Exemplo: `https://SEU-DOMINIO/webhook`
- Use o mesmo `VERIFY_TOKEN` do seu `env`.
- Assine os eventos de WhatsApp (mensagens).

> Para webhook funcionar de verdade, você precisa publicar esse servidor em algum lugar com HTTPS (Render/Railway/Fly/VPS).

## Como gravar os vídeos (exigência de análise)

### Vídeo 1 — permissão `whatsapp_business_messaging`

1) Abra o painel `/`
2) Preencha um número destino real e uma mensagem
3) Clique **Enviar agora**
4) Mostre o WhatsApp (Web ou celular) recebendo a mensagem

O painel também registra o envio e eventos recebidos no webhook.

### Vídeo 2 — permissão `whatsapp_business_management` (modelos/templates)

No menu **Modelos** (`/templates.html`) você pode:

- Criar template via API (form)
- Listar templates e ver status

E no menu **Logs** (`/logs.html`) você consegue mostrar o payload/resposta para evidência.

Normalmente, o caminho mais simples e aceito é:

- Criar o template pelo **WhatsApp Manager** (Business Manager)
- Gravar um vídeo separado mostrando a criação e o status do template

## Observações importantes

- Os logs ficam **em memória** (reiniciar o servidor apaga).
- Para produção, você vai precisar autenticação, persistência, segregação por cliente (multi-tenant), compliance e auditoria.


