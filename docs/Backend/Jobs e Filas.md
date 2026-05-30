---
title: Jobs e Filas
tags: [backend, bullmq, redis, workers, cron]
updated: 2026-05-29
---

# Jobs e Filas

Voltar para [[BulkZap]]. Arquivos: `apps/api/src/jobs/queue.ts` + `*.job.ts`. `queue.ts` é o **único** lugar que cria filas e workers.

```ts
QUEUE_NAMES = {
  sendMessage:     "send-message",
  warmupCheck:     "warmup-check",
  classifyInbound: "classify-inbound",
}
```

## Workers

| Fila | Concurrency | Cron | O que faz |
|---|---|---|---|
| `send-message` | **1** | — (sob demanda) | envia uma mensagem; sucesso → `status=sent` + `incrementDailyUsed()`; falha → `status=failed` |
| `warmup-check` | 1 | `0 3 * * *` | recalcula `dailyLimit` das contas em `warmupMode=auto` |
| `classify-inbound` | **4** | — (ao receber inbound) | classifica mensagem com Haiku (ver [[Features de IA]]) |

### send-message
Concurrency **1** para evitar race por número. Delay calculado cumulativamente com jitter (ver [[Sistema Anti-ban]]). 3 tentativas, backoff exponencial 30s. Chama `driver.sendText()` (ver [[Drivers de WhatsApp]]).

### warmup-check
Cron diário às 03:00. Fórmula `20 * 1.3^dias`, teto `MAX_DAILY_LIMIT = 500`.

### classify-inbound
Concurrency **4** (chamadas Haiku independentes). Job name `classify`, 2 tentativas, backoff 10s. Auto-blocklist em `opt_out` com `confidence >= 0.7`.

## Redis

`apps/api/src/redis.ts` — `IORedis(REDIS_URL, { maxRetriesPerRequest: null })`. Em prod, `appendonly yes` (persistência AOF), instalado nativo (`apt install redis-server`), **sem Docker** (ver [[Visão Geral]]).

## Adicionar um worker novo

1. Adicionar `QUEUE_NAMES.novoJob` e o tipo `NewJobData` em `queue.ts`.
2. Exportar `novoJobQueue` e `createNovoJobWorker()`.
3. Criar `jobs/novo-job.job.ts` exportando `startNovoJobWorker()`.
4. Chamar `startNovoJobWorker()` no boot (`index.ts`, ver [[API REST]]).
