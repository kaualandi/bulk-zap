---
title: Features de IA
tags: [ia, anthropic, opt-in]
updated: 2026-05-29
---

# Features de IA

Voltar para [[BulkZap]]. Arquivos: `apps/api/src/services/ai.service.ts`, `apps/api/src/routes/ai.ts`, `apps/api/src/jobs/classify-inbound.job.ts`.

> [!important] Tudo opt-in com failsafe
> Se `ANTHROPIC_API_KEY` está vazia, `isAiAvailable()` é false → as rotas lançam `AiUnavailableError` → retornam **HTTP 503**. O front detecta o 503 e **esconde** botões/badges — nunca quebra a UI.

## Cliente Anthropic

| Item | Valor |
|---|---|
| `MODEL_HAIKU` | `claude-haiku-4-5` (classificação) |
| `MODEL_SONNET` | `claude-sonnet-4-6` (geração) |
| Cache Redis | chave `ai:cache:` + SHA256 de `[operação, PROMPT_VERSION, input, category]`, TTL 24h |
| Prompt caching | `cache_control: { type: "ephemeral" }` no system prompt |
| Rate limit | 10 req / 60s por identifier, chave `ai:rate:{id}` |

Helpers: `completeJson<T>()` (default `maxTokens=1024`, `temperature=0.7`, extrai JSON entre `{` e `}`) e `streamText()` (`AsyncGenerator<string>` via `content_block_delta`).

## Endpoints

| Feature | Método + path | Modelo | Onde aparece |
|---|---|---|---|
| Health | `GET /ai/health` | — | `{ available: bool }` |
| Risk-check | `POST /ai/risk-check` | Haiku | `<AiRiskBadge>` em templates e `/campaigns/new` |
| Gerador de template | `POST /ai/templates/generate` | Sonnet | `<AiGenerateModal>` em `/templates` (✨) |
| Variantes | `POST /ai/templates/:id/variants` | Sonnet | endpoint pronto, sem botão dedicado ainda |
| Sugestão de campanha | `POST /ai/campaign/suggest` | Sonnet | `<AiSuggestionChip>` em `/campaigns/new` |
| Resumo de campanha | `GET /ai/campaign/:id/summary` | Sonnet (SSE) | botão "Resumir" em `/campaigns/[id]` |
| Classificador inbound | *(worker)* | Haiku | automático em `messages.upsert` |

### Risk-check

Input: `text` (1–4000 chars) + `category?`. Output:

```ts
{ riskScore: number /*1-10*/, reasons: string[] /*≤3*/, suggestions: string[] /*≤3*/, cached: boolean }
```

Avalia gatilhos de spam detection da Meta (CAPS LOCK, excesso de emojis, links encurtados, falta de personalização). Faixas: 1–3 baixo (verde), 4–6 médio (amarelo), 7–10 alto (vermelho).

### Gerador e variantes

Gerador produz **3 variações** (≤280 chars, PT-BR); variantes produz **5**. Ambos rodam um **safety check** interno: cada variação passa pelo risk-check, retêm-se as de `riskScore ≤ 7`. Se alguma > 7, re-tenta com `temperature` menor (0.8 → 0.5, até 2 tentativas). No último retry cai em fallback.

### Sugestão de campanha

Input: `category, listType, listSize, hourOfDay, poolAccounts[]`. Output: `jitterMinMs, jitterMaxMs, recommendedPoolSize, reasoning`. Heurísticas no prompt: marketing em grupos pede jitter ≥60s e pool ≥3 quando volume > 50; números novos (`daysOld<7`) ou sem warmup → mais jitter; 9–18h mais seguro.

### Resumo de campanha (SSE)

`GET /ai/campaign/:id/summary` retorna `text/event-stream`: chunks `data: { text }`, `event: done`, `event: error`. Busca a última `campaign_run` e o breakdown por account/status, e resume em 2–4 frases PT-BR.

> [!warning] Gotcha de streaming
> Não logue dentro do iterator do `streamText` — `console.log` em streams pode bagunçar o SSE no Bun.

## Classificador inbound

Roda no evento `inbound-message` (worker BullMQ `classify`, ver [[Jobs e Filas]]). Modelo Haiku, `temperature: 0.1`, `maxTokens: 200`, 2 tentativas com backoff 10s.

Classes: `opt_out | interesse | duvida | reclamacao | outro`. Grava `classification`, `confidence` (0–1) e `classifiedAt` em `inbound_messages` (pula se já classificada).

> [!danger] Auto-blocklist e threshold
> Se `classification === "opt_out" && confidence >= 0.7`, o JID entra na `contact_blocklist` (source `auto_opt_out`). **Não baixe o 0.7 sem pensar** — frases como "Para mim, perfeito!" podem ser pegas como opt-out. Reversão é manual via `removeFromBlocklist(jid)` (endpoint `DELETE /inbound/blocklist/:jid`).

## Failsafe no front

| Componente | Comportamento no 503 |
|---|---|
| `AiRiskBadge` | renderiza `null` (some) |
| `AiGenerateModal` | Alert `warning`: "IA indisponível. Configure ANTHROPIC_API_KEY…" |
| `AiSuggestionChip` | renderiza `null` (chip some) |
| hook `useAiRisk` | debounce 600ms; `status: "unavailable"` no 503; idle se texto < 10 chars |

Veja também [[Schema do Banco]] (`inbound_messages`, `contact_blocklist`) e [[Frontend]].
