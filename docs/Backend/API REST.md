---
title: API REST
tags: [backend, elysia, rest, api]
updated: 2026-05-29
---

# API REST

Voltar para [[BulkZap]]. Arquivos: `apps/api/src/index.ts` + `apps/api/src/routes/*.ts`.

## Boot (`index.ts`)

1. `createBullBoardApp()` (painel de filas).
2. Instância Elysia com CORS e `GET /health`, montando as rotas via `.use()`: accounts, contacts, groups, templates, lists, campaigns, reports, email-subscriptions, ai (ver [[Features de IA]]), inbound.
3. Monta Bull Board em `/admin/queues` e `/admin/queues/*` (ver [[Decisões de Arquitetura]] #7).
4. `app.listen({ hostname: API_HOST, port: API_PORT })`.
5. Inicia os 3 workers: `startSendMessageWorker()`, `startWarmupCheckWorker()`, `startClassifyInboundWorker()` (ver [[Jobs e Filas]]).
6. `bootAllConnected()` reativa contas não-banidas (ver [[Account Manager]]).

> [!note] Convenção de rota
> Cada arquivo exporta `<nome>Routes` (ex: `aiRoutes`). Validação com `t.Object({...})` do Elysia (não Zod). Erros customizados tratados em `.onError()` por rota.

## Endpoints por domínio

### accounts.ts
`GET /accounts` · `POST /accounts` · `GET /accounts/:id` · `POST /accounts/:id/connect` · `POST /accounts/:id/disconnect` · `POST /accounts/:id/logout` · `GET /accounts/:id/qr` · **WS** `/accounts/:id/events` · `POST /accounts/:id/sync-groups`. Ver [[WebSocket e QR]].

### campaigns.ts
`GET /campaigns` · `GET /campaigns/:id` · `POST /campaigns` · `PUT /campaigns/:id` · `GET /campaigns/:id/estimate` (duração via jitter) · `GET /campaigns/:id/validate` ([[Validação Pool×Grupo]]) · `POST /campaigns/:id/launch?respectSchedule=` · `POST /campaigns/:id/pause` · `POST /campaigns/:id/cancel` (`deleteSent?`) · `DELETE /campaigns/:id` (só draft) · `GET /campaigns/:id/runs`.

### templates.ts
`GET /templates` · `POST /templates` (extrai variáveis `{{nome}}`) · `PUT /templates/:id` · `DELETE /templates/:id`.

### contacts.ts
`GET /contacts?accountId=` · `POST /contacts/import-csv`.

### groups.ts
`GET /groups?accountId=` · `GET /groups/:id/members`.

### lists.ts
`GET /lists` · `POST /lists` · `GET /lists/:id/members` · `POST /lists/:id/members` · `DELETE /lists/:id`.

### reports.ts
`GET /reports/campaign/:id` (runs + breakdown) · `GET /reports/account/:id` (stats por status) · `GET /reports/messages?runId=&accountId=&limit=`.

### inbound.ts
`GET /inbound` (últimas 200) · `POST /inbound/:id/override` (reclassifica manual) · `GET /inbound/blocklist` · `DELETE /inbound/blocklist/:jid`.

### email-subscriptions.ts
`GET /email-subscriptions` · `POST /email-subscriptions` · `DELETE /email-subscriptions/:id`.

### ai.ts
Ver [[Features de IA]].

## Bull Board

Montado em `/admin/queues` com basic auth (`BULL_BOARD_USER`/`BULL_BOARD_PASS`), três filas adaptadas (send-message, warmup-check, classify-inbound), locale `pt-BR`, título `"BulkZap — Filas"`. Se as credenciais estão vazias, `createBullBoardApp()` retorna `null` e o painel não é montado.
