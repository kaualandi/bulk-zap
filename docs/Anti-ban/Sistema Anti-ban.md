---
title: Sistema Anti-ban
tags: [anti-ban, campanhas, baileys]
updated: 2026-05-29
---

# Sistema Anti-ban

Voltar para [[BulkZap]]. Arquivo principal: `apps/api/src/services/anti-ban.service.ts`.

> [!important] Filosofia: avisar, nunca bloquear
> Todo o anti-ban é **opt-in** e **informativo**. A UI mostra avisos com botão "Prosseguir mesmo assim". A **única** coisa que bloqueia uma campanha é a [[Validação Pool×Grupo]].

## Warmup

`warmupMode` ∈ `off | auto | manual` (default `off`), na tabela `whatsapp_accounts`.

| Modo | Comportamento |
|---|---|
| `off` | sem limite automático |
| `auto` | o worker [[Jobs e Filas\|warmup-check]] recalcula `dailyLimit` diariamente às 03:00 |
| `manual` | usuário ajusta `dailyLimit` à mão |

Fórmula do warmup automático (`warmup-check.job.ts`):

```ts
const days = (Date.now() - startedAt) / (1000*60*60*24);
const target = Math.min(
  MAX_DAILY_LIMIT,                          // 500
  Math.round(20 * Math.pow(1.3, Math.floor(days)))
);
```

Começa em ~20 msgs/dia e cresce 30% ao dia, com teto `MAX_DAILY_LIMIT = 500`.

## Limite diário

`dailyLimit` é **nullable** — `null` significa sem limite. O contador `dailyUsed` reseta a cada 24h (compara `dailyResetAt`). `incrementDailyUsed()` só é chamado **após** envio bem-sucedido (`send-message.job.ts`).

## Jitter (delay entre envios)

```ts
export function pickJitter(minMs, maxMs) {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}
```

Defaults por campanha: `jitterMinMs = 15_000` (15s), `jitterMaxMs = 90_000` (90s). A estimativa de duração usa a média: `(totalMessages - 1) * (min+max)/2`.

## Rotação de números no pool

`nextAccountFromPool(poolIds)` escolhe, entre as contas `connected` do pool que ainda têm folga (`dailyUsed < dailyLimit`, ou limite null), a de **menor `dailyUsed`**. Retorna `null` se nenhuma tem folga.

```ts
candidates.sort((a, b) => a.dailyUsed - b.dailyUsed);
return candidates[0]!.id;
```

## Pausa por ban (real)

A pausa automática só acontece quando um ban **de verdade** ocorre, detectado no `connection.update` do [[Drivers de WhatsApp|BaileysDriver]]:

```ts
const BAN_STATUS_CODES = new Set([401, 403, 440, 515]);
```

Também tratam `DisconnectReason.loggedOut` e `connectionReplaced` → emitem `banned` e param o reconnect. Ao receber `banned`, o [[Account Manager]] seta `status = banned`, registra evento e **remove o driver da memória**.

Para desconexões não-ban, há **reconnect com backoff exponencial**: `min(3000 * 2^tentativa, 60_000)` → 3s, 6s, 12s, 24s, 48s, 60s (teto).

## Constantes

| Constante | Valor | Arquivo |
|---|---|---|
| `MAX_DAILY_LIMIT` | 500 | `warmup-check.job.ts` |
| fórmula warmup | `20 * 1.3^dias` | `warmup-check.job.ts` |
| `jitterMinMs` default | 15 000 ms | `campaign.service.ts` |
| `jitterMaxMs` default | 90 000 ms | `campaign.service.ts` |
| `BAN_STATUS_CODES` | 401, 403, 440, 515 | `baileys-driver.ts` |
| backoff inicial / teto | 3 000 ms / 60 000 ms | `baileys-driver.ts` |

Veja também [[Jobs e Filas]] (concurrency, cron) e [[Account Manager]] (como o ban é propagado).
