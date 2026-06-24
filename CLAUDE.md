# CLAUDE.md

Guia para futuras sessões de IA neste repositório. Leia isso antes de mexer no código.

## O que é o BulkZap

Plataforma de disparos WhatsApp em **grupos** (não DMs em massa) com anti-ban, fallback Cloud API e camada de IA. Single-tenant, cliente único hoje — evolução pretendida para SaaS.

**Quem usa**: um cliente que hoje usa DevZap e sofre bans recorrentes. O BulkZap é a alternativa própria.

**Premissa central**: o usuário precisa poder cadastrar um número novo e disparar para 100 grupos no mesmo dia. Anti-ban é **opt-in** e **avisa, nunca bloqueia** — exceto a validação pool×grupo, que é gate.

Plano completo: `/Users/kaualandi/.claude/plans/vamos-l-preciso-da-steady-sonnet.md`

## Stack

| Camada | Tech | Notas |
|---|---|---|
| Runtime | Bun 1.3+ | Não trocar para Node sem testar Baileys |
| Monorepo | Bun workspaces + Turborepo | `apps/*` + `packages/*` |
| API | ElysiaJS + TypeScript | REST + WebSocket nativo |
| ORM | Drizzle | Schema em `packages/db` |
| Banco | Postgres 16 | Docker em dev, nativo na EC2 prod |
| Fila | BullMQ + Redis | Redis local (brew) em dev, nativo em prod |
| Frontend | Next.js 16 (App Router) + Tailwind 4 | Tailwind 4 sem config file — tokens em `globals.css` |
| WhatsApp | `@whiskeysockets/baileys` 7.x | Driver principal — único que faz grupos |
| Cloud API | fetch direto pro Graph API | Adapter `cloud-api-driver.ts` |
| Email | Resend | Para alertas de ban/desconexão |
| IA | Anthropic SDK (Haiku 4.5 + Sonnet 4.6) | Tudo opt-in via `ANTHROPIC_API_KEY` |
| Admin filas | Bull Board (Hono adapter) | Montado em `/admin/queues` com basic auth |
| Deploy | 1 EC2 + PM2 | **Sem Docker em prod** — apps rodam nativo |

## Estrutura

```
bulk-zap/
├── apps/
│   ├── api/          # Elysia: drivers, jobs, routes, services
│   └── web/          # Next.js: app router, components/ui, components, lib
├── packages/
│   ├── db/           # Drizzle schema + migrations (autoridade do banco)
│   ├── eslint-config/    # @repo/eslint-config
│   └── typescript-config/ # @repo/typescript-config
├── docker-compose.yml    # APENAS Postgres em dev
├── ecosystem.config.js   # PM2 para prod
├── .env.example
└── README.md
```

**Não tente** rodar Postgres ou Redis em Docker em prod — o usuário escolheu nativo.

## Setup local (do zero)

```bash
brew install bun redis
brew services start redis
docker compose up -d                     # Postgres
cp .env.example .env                     # editar conforme necessário
bun install
cd packages/db && bun run db:migrate     # aplica todas as migrations
cd ../..
bun run dev                              # turborepo: api (3000) + web (3001)
```

Acessos:
- API: http://localhost:3000 (health: `/health`, IA health: `/ai/health`)
- Web: http://localhost:3001
- Bull Board (filas): http://localhost:3000/admin/queues (basic auth via `BULL_BOARD_USER`/`BULL_BOARD_PASS`)

## Comandos essenciais

```bash
# Raiz
bun run dev              # turbo: api + web
bun run build            # turbo: build de todos
bun run check-types      # turbo: tsc --noEmit em todos
bun run lint

# packages/db (após mudar schema)
bun run db:generate      # gera migration SQL
bun run db:migrate       # aplica migrations pendentes
bun run db:studio        # UI gráfica do banco

# apps/api (testes manuais)
bun run dev              # bun watch + .env do root
curl http://localhost:3000/health
curl http://localhost:3000/ai/health     # {available: bool}
```

## Decisões de arquitetura críticas

### 1. Sessões Baileys em Postgres (não filesystem)

Tabelas `baileys_creds` + `baileys_keys` em `packages/db/src/schema/baileys-auth.ts`. A implementação está em `apps/api/src/services/session-store.service.ts` via `usePostgresAuthState()`.

Vantagem: backup unificado via `pg_dump`, sobrevive restart/migração sem mexer em volumes.

### 2. Driver abstrato

Interface em `apps/api/src/drivers/whatsapp-driver.ts`. Dois drivers:
- `BaileysDriver` — suporta tudo (incluindo grupos).
- `CloudApiDriver` — DMs apenas, lança `UnsupportedOperationError` em `listGroups()` / `isMemberOfGroup()`.

UI esconde features de grupo quando o número é Cloud API.

### 3. Anti-ban: avisar, nunca bloquear

- `warmupMode` é `off | auto | manual`, default `off`.
- `dailyLimit` é **nullable** — null = sem limite.
- Warnings em UI (em `/campaigns/new`) são informativos, com botão "Prosseguir mesmo assim".
- Pause por ban **só** acontece com `statusCode 403` (forbidden) em `connection.update` — é o **único** ban real do WhatsApp. Os outros status codes de desconexão são tratados em `baileys-driver.ts` e **não** são ban:
  - `515` (restartRequired): sinal normal logo após escanear o QR — o driver **reconecta** sozinho pra concluir o pareamento.
  - `440` (connectionReplaced): outro socket assumiu (ex.: restart do `bun --watch`) — desconecta sem reconectar.
  - `401` (loggedOut): sessão deslinkada — limpa as creds e pede re-QR (não é ban).
  - **Nunca** volte a tratar 515/440/401 como ban (bug histórico: o set `[401,403,440,515]` gerava `qr → connecting → banned` falso a cada pareamento).

**A única coisa que bloqueia campanha é validação pool×grupo** (`group-validation.service.ts`).

### 4. BullMQ persistente

Redis configurado com `appendonly yes` em prod. Três workers:
- `send-message.job.ts` — concurrency 1 (evita race por número).
- `warmup-check.job.ts` — cron diário às 03:00 (`repeat: { pattern: "0 3 * * *" }`).
- `classify-inbound.job.ts` — concurrency 4 (chamadas Haiku independentes).

`jobs/queue.ts` é o único lugar que cria filas e workers.

### 5. AccountManager singleton em memória

`apps/api/src/services/account-manager.service.ts` mantém `Map<accountId, WhatsAppDriver>`. Drivers ativos persistem entre requests, recebem eventos do Baileys e:
- Atualizam `whatsapp_accounts.status`
- Registram eventos em `events`
- Persistem `inbound_messages` e enfileiram `classify-inbound`
- Sincronizam `contacts` e `group_memberships`

No boot do app, `bootAllConnected()` reativa todos os números que não estão `banned`.

### 6. WebSocket de QR

Endpoint `/accounts/:id/events` (Elysia `.ws()`). Front escuta e renderiza o QR como data URL (via `qrcode` npm). Eventos do driver são re-emitidos pela WS para todos os clients subscritos.

`wsSubscriptions` map em `routes/accounts.ts` mantém unsubscribe handlers.

### 7. Bull Board montado dentro do Elysia (Hono adapter)

Bull Board não tem adapter Elysia oficial. Solução: usar `@bull-board/hono`, criar outer Hono que monta o inner com `app.route(BASE_PATH, inner)` (preserva o prefix nas rotas internas), aplicar `basicAuth()` e `trimTrailingSlash()`. No `index.ts`, rotear via `app.all("/admin/queues", ...)` e `app.all("/admin/queues/*", ...)` — **não** usar `.mount()` porque ele faz strip do prefix e quebra o resolução de assets estáticos do Bull Board.

Se `BULL_BOARD_USER` e `BULL_BOARD_PASS` estão vazios, `createBullBoardApp()` retorna `null` e o painel não é montado.

Locale forçado a `pt-BR` via `uiConfig.locale.lng`. Title custom: `"BulkZap — Filas"`.

### 8. IA opt-in com failsafe

Cliente Anthropic em `apps/api/src/services/ai.service.ts`:
- Se `ANTHROPIC_API_KEY` vazia → lança `AiUnavailableError` → rota retorna 503.
- Front detecta 503 e **esconde** botões/badges (não quebra a UI).
- Cache em Redis por hash do input (TTL 24h) para risk-check.
- Prompt caching nativo do Anthropic SDK (`cache_control: { type: "ephemeral" }`) no system prompt.

Modelos:
- `MODEL_HAIKU = "claude-haiku-4-5"` — classificação rápida, barata (~$0.0005/req).
- `MODEL_SONNET = "claude-sonnet-4-6"` — geração criativa (~$0.003-0.005/req).

### 9. Billing pós-pago (mensalidade + excedente por mensagem)

Em `apps/api/src/services/billing.service.ts`. Cada plano tem mensalidade
(`monthlyPriceCents`, assinatura recorrente via preapproval do MP) + franquia
(`includedDispatches`). Acima da franquia, **cada mensagem é cobrada** (preço por
mensagem = `overagePackagePriceCents / overagePackageSize`, sem coluna nova).

- **Janela de quota = mês calendário** (`resolvePeriod()`), não o ciclo do MP — o
  `dispatch_usage` (chaveado por `org+periodStart`) precisa avançar de forma
  previsível. `recordDispatch` acumula `dispatchCount` e `overageDispatches`.
- **Gate (`canDispatch`) é pós-pago**: NÃO bloqueia ao estourar a franquia (o
  excedente acumula). Só bloqueia por: sem assinatura, assinatura ≠ `authorized`,
  ou **fatura de excedente não paga** de um período fechado (`overage_invoice_unpaid`)
  — esse é o controle de crédito.
- **Fechamento**: o cron `close-billing-period.job.ts` (diário, 04:00) fatura o
  excedente de períodos já fechados → cria `overage_invoices` (1 por `org+periodStart`)
  + um Checkout Pro (`createOverageInvoicePayment`, `external_reference =
  overage_invoice:<id>`). O webhook marca a fatura como `paid`.
- Tabela `overage_purchases` é **legacy** (pré-pago, descontinuado) — não usar.

## Features de IA (todas opcionais via env)

| Feature | Endpoint | Modelo | Onde aparece |
|---|---|---|---|
| Risk-check | `POST /ai/risk-check` | Haiku | `<AiRiskBadge>` no editor de templates e em `/campaigns/new` |
| Gerador de template | `POST /ai/templates/generate` | Sonnet | `<AiGenerateModal>` no `/templates` (botão ✨) |
| Variantes de template | `POST /ai/templates/:id/variants` | Sonnet | (endpoint pronto; frontend ainda não tem botão dedicado) |
| Sugestão de campanha | `POST /ai/campaign/suggest` | Sonnet | `<AiSuggestionChip>` no `/campaigns/new` |
| Resumo de campanha | `GET /ai/campaign/:id/summary` | Sonnet streaming SSE | Botão "Resumir" no `/campaigns/[id]` |
| Classificador inbound | (worker) | Haiku | Roda automático em `messages.upsert` |

O gerador chama o risk-check internamente — se score >7, re-tenta com temperature menor.

## Sistema de glossário (UX)

Termos técnicos têm tooltip inline. Não invente novo padrão — use o existente:

1. Adicione a definição em `apps/web/src/lib/glossary.ts`.
2. Use `<Term k="novoTermo" />` em qualquer JSX. Aceita `children` para texto customizado.
3. Tooltip é CSS puro (`group-hover` + `group-focus-within`), sem JS extra.

Padrão visual: linha "Termos: A · B · C ·  ..." logo abaixo do `<PageHeader>`.

## Convenções de código

### TypeScript
- `noUncheckedIndexedAccess` está OFF em `apps/api` (Drizzle joins gerariam churn).
- `noUncheckedIndexedAccess` ON nos demais packages.
- Imports do workspace via `@bulk-zap/db`, do app via `@/...` (Next), do api via paths relativos `.js` (mesmo em .ts files — exigência ESM/NodeNext).

### Drizzle
- Schemas em `packages/db/src/schema/*.ts`, agregados em `index.ts`.
- Sempre exporte `$inferSelect` e `$inferInsert` ao final do arquivo.
- Composite PKs usam `primaryKey({ columns: [...] })`, não objeto literal.
- Após mudar schema: `cd packages/db && bun run db:generate && bun run db:migrate`.

### Elysia
- Rotas agrupadas por domínio em `apps/api/src/routes/*.ts`.
- Cada rota exporta `<nome>Routes` (ex: `aiRoutes`), montadas via `.use()` em `index.ts`.
- Validação com `t.Object({ ... })` do Elysia (não Zod).
- Erros customizados (`AiUnavailableError`) tratados em `.onError()` por rota.

### Frontend
- Componentes UI primitivos em `apps/web/src/components/ui/*` (Button, Input, Card, Badge, Table, PageHeader, EmptyState, Alert, Term).
- Componentes de feature em `apps/web/src/components/*` (AiRiskBadge, AiGenerateModal, AiSuggestionChip, Sidebar).
- Hooks em `apps/web/src/lib/use-*.ts`.
- Cliente HTTP em `apps/web/src/lib/api.ts` — sempre estender lá quando adicionar novos endpoints.
- Tipos compartilhados front/back ficam **duplicados** em `apps/web/src/lib/api.ts` (não há eden treaty ainda).

### CSS / Tailwind 4
- `globals.css` faz `@import "tailwindcss";` e define tokens em `@theme`.
- **Não** crie `tailwind.config.js` — Tailwind 4 não usa.
- Cores customizadas (ex: `--color-brand-*`) ficam no `@theme`.
- Use `cn()` helper de `apps/web/src/lib/cn.ts` para classes condicionais.

## Como fazer coisas comuns

### Adicionar uma tabela nova
1. Criar `packages/db/src/schema/nome.ts` com export do table + tipos inferidos.
2. Adicionar `export * from "./nome.js"` em `packages/db/src/schema/index.ts`.
3. Rodar `cd packages/db && bun run db:generate && bun run db:migrate`.

### Adicionar um endpoint de IA
1. Adicionar prompt system como const em `apps/api/src/routes/ai.ts`.
2. Definir tipo do retorno (`type FooResult = { ... }`).
3. Usar `completeJson<FooResult>()` (síncrono JSON) ou `streamText()` (SSE).
4. Adicionar rota Elysia com validação `t.Object(...)`.
5. No front: helper em `apps/web/src/lib/api.ts` + componente em `apps/web/src/components/`.

### Adicionar um worker BullMQ
1. Adicionar `QUEUE_NAMES.novoJob` e `NewJobData` type em `apps/api/src/jobs/queue.ts`.
2. Exportar `novoJobQueue` e `createNovoJobWorker()`.
3. Criar `apps/api/src/jobs/novo-job.job.ts` exportando `startNovoJobWorker()`.
4. Chamar `startNovoJobWorker()` em `apps/api/src/index.ts` no boot.

### Adicionar um driver de WhatsApp novo
1. Implementar interface `WhatsAppDriver` de `apps/api/src/drivers/whatsapp-driver.ts`.
2. Adicionar valor ao enum `driverEnum` em `packages/db/src/schema/whatsapp-accounts.ts` (e migrar).
3. Em `account-manager.service.ts`, escolher o driver com base em `account.driver`.

### Adicionar um termo ao glossário
1. Editar `apps/web/src/lib/glossary.ts`.
2. Usar `<Term k="suaKey" />` onde quiser.

## Gotchas

1. **Bun + Anthropic SDK**: o SDK usa `node:crypto` e funciona em Bun, mas `console.log` em streams pode bagunçar SSE. Não logue dentro do `streamText` iterator.

2. **Tailwind 4 sem config file**: se uma classe não funcionar, verifique tokens em `globals.css` `@theme`, não num `tailwind.config.js` (não existe).

3. **Baileys auth não em FS**: nunca volte para `useMultiFileAuthState`. As tabelas `baileys_creds`/`baileys_keys` são a fonte. Cache em memória existe dentro de `session-store.service.ts` mas é por sessão.

4. **PM2 em prod, não Docker**: o cliente quer apps nativos na EC2. Postgres e Redis via `apt install`, apps via `pm2 start ecosystem.config.js`.

5. **Validação pool×grupo é gate**: nunca permita campanha em grupos sair de `draft` se algum número do pool não for membro de algum grupo alvo. Anti-ban é avisos; isso é hard block.

6. **Cloud API NÃO faz grupos**: nem tente. UI esconde features de grupo se driver=`cloud_api`. Para o caso de uso principal (cliente atual), Baileys é o único caminho.

7. **Path imports com `.js` em arquivos `.ts`**: ESM + NodeNext exige a extensão. Não remova.

8. **AI failsafe**: nunca deixe falta de `ANTHROPIC_API_KEY` quebrar a UI. Sempre cheque com `isAiAvailable()` ou trate 503 no front.

9. **Inbound classification pode errar**: "Para mim, perfeito!" pode ser pego como opt-out. Threshold é confidence >= 0.7. UI permite reverter. Não baixe o threshold sem pensar.

10. **JIDs de grupo terminam em `@g.us`**, contatos em `@s.whatsapp.net`. Filtramos grupos em `messages.upsert` para não tratar como inbound de pessoa.

11. **`bun --watch` reinicia a sessão Baileys a cada save**: o socket morre e reconecta, e o celular pareado notifica "sincronização concluída" a cada ciclo. Em dev, com número pareado, prefira `cd apps/api && bun run start` (sem watch) para não inundar o celular de notificações. O reconnect tem backoff exponencial (3s → 60s) em `baileys-driver.ts`, mas evitar o ciclo é melhor.

## Roadmap conhecido (pós-MVP)

Listado no plano completo. Curto: multi-tenant, mídia (imagens/áudios), webhooks out, re-QR automático com push, painel de qualidade do número, onboarding conversacional.

## Onde achar coisas rapidamente

| Quero ver... | Vai em... |
|---|---|
| Schema completo do banco | `packages/db/src/schema/index.ts` |
| Lógica de envio (jitter, rotação) | `apps/api/src/services/anti-ban.service.ts` + `jobs/send-message.job.ts` |
| Como o Baileys conecta | `apps/api/src/drivers/baileys-driver.ts` |
| Pool de drivers em runtime | `apps/api/src/services/account-manager.service.ts` |
| Endpoints REST | `apps/api/src/routes/*.ts` |
| Prompts de IA | `apps/api/src/routes/ai.ts` (system prompts no topo) + `jobs/classify-inbound.job.ts` |
| Cliente HTTP do front | `apps/web/src/lib/api.ts` |
| Tooltips de termos | `apps/web/src/lib/glossary.ts` + `components/ui/term.tsx` |
| Deploy/runbook | `README.md` (seção "Produção: deploy em EC2") |
