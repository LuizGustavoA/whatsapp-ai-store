# WhatsApp AI Store

Sistema de atendimento e vendas via WhatsApp com IA para restaurantes e delivery.

> Roadmap completo e APIs: [ROADMAP.md](./ROADMAP.md)

---
<video src="**/painel-admin.mp4" controls width="100%"></video>






## O que o sistema faz

- **Atendimento automático** no WhatsApp (Meta Cloud API) com respostas em português
- **Cardápio e pedidos** montados pela IA (OpenAI) com intenções `chat` e `checkout`
- **Pagamento PIX** via Mercado Pago ou chave PIX estática
- **Confirmação de pagamento** quando o cliente envia *"paguei"* no WhatsApp
- **Cozinha e entregas** com ciclo de status e notificações automáticas
- **Cashback** de 5% acumulado na carteira virtual do cliente
- **Painel administrativo** (Vite + React) com login JWT, dashboard e listagem de pedidos
- **Relatórios** de vendas, ticket médio e produtos mais vendidos
- **Integração N8N** via webhooks para automações externas (e-mail, SMS, nota fiscal)

---

## Pré-requisitos

| Requisito | Versão mínima |
|-----------|---------------|
| Node.js | 18+ |
| PostgreSQL | 16 |
| Docker (opcional) | para banco local ou deploy |

**Contas externas necessárias:**

- [Meta for Developers](https://developers.facebook.com/) — WhatsApp Cloud API
- [OpenAI](https://platform.openai.com/) — chave de API
- [Mercado Pago](https://www.mercadopago.com.br/developers) — opcional (PIX dinâmico)

---

## Configuração passo a passo

### 1. Clonar e instalar dependências

```bash
git clone <repo-url>
cd whatsapp-ai-store

cd backend
npm install

cd admin-panel
npm install
```

### 2. Subir o PostgreSQL

**Opção A — Docker (recomendado para dev):**

```bash
cp .env.example .env
# Edite .env e defina POSTGRES_PASSWORD e EVOLUTION_API_KEY
docker compose up -d postgres
```

**Opção B — PostgreSQL instalado localmente** — crie o banco `evolution`.

### 3. Configurar variáveis de ambiente

```bash
cd backend
cp .env.example .env
```

Edite o `.env` com os seus valores reais. **Nunca commite o `.env`** — ele já está no `.gitignore`.

### 4. Migrar banco e popular dados iniciais

```bash
cd backend
npm run migrate
npm run seed
```

O seed cria:
- 4 produtos de exemplo (pizzas e bebidas)
- Admin padrão: usuário **`admin`** / senha **`admin123`** — **altere após o primeiro login**

### 5. Iniciar o backend

```bash
cd backend
npm run dev
```

Servidor em `http://localhost:3000`

### 6. Iniciar o painel admin (desenvolvimento)

```bash
cd backend/admin-panel
npm run dev
```

Painel em `http://localhost:5173` (desenvolvimento). Em produção, o nginx serve em `/admin/`.

O Vite faz proxy de `/api/*` → `http://localhost:3000/*`.

### 7. Configurar webhook do WhatsApp (Meta)

1. Crie um app em [Meta for Developers](https://developers.facebook.com/)
2. Adicione o produto **WhatsApp**
3. Configure o webhook apontando para a URL pública do seu servidor:
   - Dev: use [ngrok](https://ngrok.com/) → `https://xxxx.ngrok.io/webhook`
   - Produção: `https://seudominio.com/webhook`
4. Use o mesmo valor de `WHATSAPP_VERIFY_TOKEN` no `.env` e no painel Meta
5. Inscreva-se no evento **messages**

### 8. Testar o fluxo completo

1. Envie uma mensagem ao número WhatsApp configurado
2. Peça o cardápio e monte um pedido
3. Confirme o checkout → receba o código PIX
4. Envie **"paguei"** → pedido vai para status `paid`
5. Use o painel admin ou as APIs `/kitchen` e `/deliveries` para avançar o pedido

---

## Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env`.

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `DB_USER` | Sim | Usuário PostgreSQL |
| `DB_HOST` | Sim | Host do banco (`localhost` ou `postgres` no Docker) |
| `DB_NAME` | Sim | Nome do banco |
| `DB_PASSWORD` | Sim | Senha do banco |
| `DB_PORT` | Sim | Porta (padrão `5432`) |
| `JWT_SECRET` | Sim | Segredo para tokens JWT (use string longa e aleatória) |
| `WHATSAPP_TOKEN` | Sim | Token permanente da Meta Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | Sim | ID do número WhatsApp Business |
| `WHATSAPP_VERIFY_TOKEN` | Sim | Token de verificação do webhook |
| `OPENROUTER_API_KEY` | Sim* | Chave OpenRouter (grátis em [openrouter.ai](https://openrouter.ai/)) |
| `OPENROUTER_MODEL` | Não | Padrão: `openrouter/free` |
| `OPENAI_API_KEY` | Sim* | *Use OpenRouter **ou** OpenAI (OpenRouter tem prioridade) |
| `OPENAI_MODEL` | Não | Padrão: `gpt-4o-mini` |
| `MERCADO_PAGO_ACCESS_TOKEN` | Não | PIX dinâmico via Mercado Pago |
| `MERCADO_PAGO_PAYER_EMAIL` | Não | E-mail do pagador (MP) |
| `PIX_KEY` | Não* | *Obrigatório se não usar Mercado Pago |
| `PIX_MERCHANT_NAME` | Não | Nome exibido no PIX estático |
| `PIX_MERCHANT_CITY` | Não | Cidade no PIX estático |
| `CASHBACK_RATE` | Não | Padrão: `0.05` (5%) |
| `CORS_ORIGIN` | Não | Origem permitida (dev: `http://localhost:5173`) |
| `PORT` | Não | Padrão: `3000` |
| `N8N_WEBHOOK_ORDER_CREATED` | Não | URL webhook N8N ao criar pedido |
| `N8N_WEBHOOK_ORDER_PAID` | Não | URL webhook N8N ao confirmar pagamento |
| `N8N_WEBHOOK_SECRET` | Não | Header `X-Webhook-Secret` opcional |

---

## Comandos úteis

```bash
# Backend
cd backend
npm run dev        # desenvolvimento (nodemon)
npm start          # produção
npm run migrate    # aplicar schema.sql
npm run seed       # produtos + admin padrão

# Painel admin
cd admin-panel
npm run dev        # http://localhost:5173/admin/
npm run build      # gera dist/ para Nginx

# Deploy (produção) — senhas vêm de backend/.env
docker compose --env-file backend/.env -f docker-compose.production.yml up -d --build
```

---

## Login no painel administrativo

Após `npm run seed`:

| Campo | Valor padrão |
|-------|--------------|
| Usuário | `admin` |
| Senha | `admin123` |

O token JWT expira em **8 horas**. Credenciais ficam na tabela `admins` com `password_hash` (bcrypt).

**Login via API:**

```bash
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Use o `token` retornado no header `Authorization: Bearer <token>` nas rotas protegidas.

---

## Deploy em VPS (Docker)

1. Configure `backend/.env` na VPS
2. Compile o painel: `cd admin-panel && npm run build`
3. Suba os serviços:

```bash
docker compose --env-file backend/.env -f docker-compose.production.yml up -d --build
```

| Serviço | Função |
|---------|--------|
| `postgres` | Banco com volume persistente |
| `backend` | API Node.js na porta 3000 (interna) |
| `nginx` | Reverse proxy nas portas 80/443 |

**Rotas expostas pelo Nginx:**

| URL pública | Destino |
|-------------|---------|
| `/webhook` | Backend (WhatsApp) |
| `/api/*` | Backend (APIs protegidas) |
| `/admin/*` | Painel React estático |

Após subir, execute migrate e seed dentro do container backend:

```bash
docker exec whatsapp-ai-backend node database/migrate.js
docker exec whatsapp-ai-backend node database/seed.js
```

---

## Estrutura resumida

```
backend/          API Node.js + WhatsApp + IA
admin-panel/      Painel React (Vite)
nginx/            Configuração reverse proxy
Dockerfile        Imagem de produção do backend
```

Para detalhes de cada fase, endpoints e fluxos, consulte [ROADMAP.md](./ROADMAP.md).
