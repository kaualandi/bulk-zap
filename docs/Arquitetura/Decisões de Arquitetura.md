---
title: Decisões de Arquitetura
tags: [arquitetura, decisões, adr]
updated: 2026-05-29
---

# Decisões de Arquitetura

Voltar para [[BulkZap]].

As oito decisões críticas que moldam o sistema. Cada uma tem um *porquê* — não desfaça sem entender o trade-off.

## 1. Sessões Baileys em Postgres (não filesystem)

Tabelas `baileys_creds` + `baileys_keys` (ver [[Schema do Banco]]), implementadas em `session-store.service.ts` via `usePostgresAuthState()`.

> [!success] Vantagem
> Backup unificado via `pg_dump`, sobrevive a restart/migração sem mexer em volumes.

> [!danger] Gotcha
> Nunca volte para `useMultiFileAuthState`. As tabelas são a fonte de verdade. Há cache em memória dentro de `session-store.service.ts`, mas é por sessão.

## 2. Driver abstrato

Interface em `whatsapp-driver.ts`. Dois drivers — ver [[Drivers de WhatsApp]].
- `BaileysDriver` — suporta tudo, incluindo grupos.
- `CloudApiDriver` — DMs apenas; lança `UnsupportedOperationError` em `listGroups()` / `isMemberOfGroup()` / `deleteMessage()`.

A UI esconde features de grupo quando o número é Cloud API.

## 3. Anti-ban: avisar, nunca bloquear

Ver [[Sistema Anti-ban]]. `warmupMode` default `off`, `dailyLimit` nullable (null = sem limite). Warnings na UI são informativos com botão "Prosseguir mesmo assim".

> [!warning] A única coisa que bloqueia campanha é a [[Validação Pool×Grupo]]
> Anti-ban é avisos. Validação pool×grupo é *hard gate*.

## 4. BullMQ persistente

Redis com `appendonly yes` em prod. Três workers — ver [[Jobs e Filas]]. `jobs/queue.ts` é o único lugar que cria filas e workers.

## 5. AccountManager singleton em memória

Ver [[Account Manager]]. Mantém `Map<accountId, WhatsAppDriver>` vivo entre requests. No boot, `bootAllConnected()` reativa todos os números que não estão `banned`.

## 6. WebSocket de QR

Endpoint `/accounts/:id/events`. Ver [[WebSocket e QR]]. O front renderiza o QR como data URL via `qrcode` npm.

## 7. Bull Board montado dentro do Elysia (Hono adapter)

Bull Board não tem adapter Elysia oficial. Solução: `@bull-board/hono`, outer Hono montando o inner com `app.route(BASE_PATH, inner)` (preserva o prefix), `basicAuth()` + `trimTrailingSlash()`.

> [!danger] Não use `.mount()`
> `.mount()` faz strip do prefix e quebra a resolução de assets estáticos do Bull Board. Use `app.all("/admin/queues", ...)` e `app.all("/admin/queues/*", ...)`. Locale forçado `pt-BR`, título `"BulkZap — Filas"`.

## 8. IA opt-in com failsafe

Ver [[Features de IA]]. Se `ANTHROPIC_API_KEY` vazia → `AiUnavailableError` → rota retorna **503** → front esconde botões/badges (não quebra a UI).

> [!info] Cache e prompt caching
> Cache em Redis por hash do input (TTL 24h). Prompt caching nativo do SDK (`cache_control: { type: "ephemeral" }`) no system prompt.
