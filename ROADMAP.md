# ROADMAP — WhatsApp AI Store

Sistema de atendimento e vendas via WhatsApp com IA, cardápio, pedidos, pagamento PIX, cozinha, entregas, cashback e painel administrativo.

---

## Fases do Projeto

### ✅ Concluídas (1–14)

| Fase | Descrição |
|------|-----------|
| 1 | Infraestrutura (Node.js, Express, `.env`) |
| 2 | Banco de Dados (PostgreSQL) |
| 3 | WhatsApp (webhook Meta Cloud API) |
| 4 | IA OpenAI (intenções `chat` / `checkout`) |
| 5 | Produtos (CRUD `/products`) |
| 6 | Pedidos (`orders`, `order_items`) |
| 7 | PIX (Mercado Pago / estático) |
| 8 | Produção/Cozinha (`/kitchen`, ciclo de status) |
| 9 | Entregas (`/deliveries`, estafetas + WhatsApp) |
| 10 | Cashback (carteira virtual, 5% por compra) |
| 11 | Histórico Inteligente — Métricas e ticket médio |
| 12 | Recomendação IA — Upsell e cross-sell |
| 13 | Promoções — Ofertas automáticas |
| 14 | Atendimento Humano — Transbordo para atendente |

### ✅ Concluídas (15–19)

| Fase | Descrição |
|------|-----------|
| 15 | Painel Administrativo — Dashboard React (Vite) |
| 16 | Relatórios — `/reports/sales`, `/reports/dashboard` |
| 17 | N8N — Webhooks (`order.created`, `order.paid`) |
| 18 | Segurança — JWT (8h), tabela `admins`, logs |
| 19 | Deploy — Docker, Nginx, `docker-compose.production.yml` |

---

## Fluxo Completo (WhatsApp → Entrega)

```
Cliente envia mensagem → POST /webhook
        ↓
   "paguei" → confirma pagamento + cashback 5%
   mensagem normal → OpenAI (cardápio + saldo cashback)
        ↓
   checkout → pedido (com desconto cashback opcional) + PIX
        ↓
Cozinha: paid → preparing → ready
        ↓
Entrega: out_for_delivery (notifica WhatsApp) → delivered
        ↓
N8N: webhooks em order.created e order.paid
```

**Ciclo de status do pedido:**
`pending` → `paid` → `preparing` → `ready` → `out_for_delivery` → `delivered`

---

## APIs

### WhatsApp — `/webhook`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/webhook` | Verificação Meta (hub.verify_token) |
| POST | `/webhook` | Recebe mensagens do cliente |

### Autenticação — `/admin`
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/admin/login` | — | Login (retorna JWT 8h) |
| GET | `/admin/me` | JWT | Dados do admin logado |

### Produtos — `/products` (JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/products` | Lista produtos |
| POST | `/products` | Cria produto |
| PUT | `/products/:id` | Atualiza produto |
| DELETE | `/products/:id` | Remove produto |

### Cozinha — `/kitchen` (JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/kitchen/orders` | Lista pedidos (`?status=paid,preparing,ready`) |
| PUT | `/kitchen/orders/:id/status` | Avança status do pedido |

**Exemplo — iniciar preparo:**
```json
{ "status": "preparing" }
```

**Exemplo — enviar para entrega:**
```json
{ "status": "out_for_delivery", "courier_name": "João Silva" }
```

### Entregas — `/deliveries` (JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/deliveries` | Lista entregas |
| POST | `/deliveries` | Atribui estafeta a pedido `ready` |
| PUT | `/deliveries/:id/status` | Atualiza (`assigned` → `in_transit` → `delivered`) |

### Relatórios — `/reports` (JWT)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/reports/dashboard` | Resumo do mês, top produtos, pedidos recentes |
| GET | `/reports/sales` | Vendas no período (`?from=&to=`) |
| GET | `/reports/orders` | Lista de pedidos para o painel |

### Cashback (Fase 10)
- Tabela `customers` com `cashback_balance`
- 5% do valor pago acumula automaticamente (`CASHBACK_RATE` no `.env`)
- Cliente pode pedir uso do saldo no checkout (`use_cashback: true` na IA)
- Confirmação: enviar **"paguei"** no WhatsApp

### N8N (Fase 17)
Eventos disparados automaticamente:
- `order.created` — checkout finalizado (aguardando pagamento)
- `order.paid` — pagamento confirmado

Variáveis no `.env`:
- `N8N_WEBHOOK_ORDER_CREATED`
- `N8N_WEBHOOK_ORDER_PAID`
- `N8N_WEBHOOK_URL` (fallback genérico)
- `N8N_WEBHOOK_SECRET` (header opcional)

---

## Estrutura do Projeto

```
whatsapp-ai-store/
├── backend/
│   ├── src/
│   │   ├── models/       Product, Order, Admin, Customer...
│   │   ├── services/     openai, order, payment, n8n, report...
│   │   ├── controllers/  auth, report, kitchen, delivery...
│   │   ├── routes/
│   │   └── middlewares/  authMiddleware, errorLogger
│   ├── models/           Conversation, Message
│   ├── database/         schema.sql, migrate.js, seed.js
│   └── server.js
├── admin-panel/          Vite + React (painel JWT)
├── nginx/                nginx.conf (produção)
├── Dockerfile
└── docker-compose.production.yml
```

---

## Prioridade de implementação (Fases 15–19)

1. **Fase 18** — Segurança (JWT + tabela `admins` + logs)
2. **Fase 16** — Relatórios protegidos
3. **Fase 19** — Docker + Nginx
4. **Fase 17** — Webhooks N8N
5. **Fase 15** — Painel admin Vite + React
