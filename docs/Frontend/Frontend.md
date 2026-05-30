---
title: Frontend
tags: [frontend, nextjs, react, tailwind]
updated: 2026-05-29
---

# Frontend

Voltar para [[BulkZap]]. App: `apps/web` (Next.js 16 App Router + Tailwind 4).

## Páginas (App Router)

| Rota | Propósito |
|---|---|
| `/` | Home — cards de atalho (conectar número, nova campanha, resultados) |
| `/accounts` | Lista números com status/driver/limite; form inline; refresh a cada 4s |
| `/accounts/:id` | Detalhe — QR via [[WebSocket e QR]], conectar/desconectar/logout, log de eventos em tempo real |
| `/campaigns` | Lista campanhas (status, categoria, pool) |
| `/campaigns/new` | Criar draft — template, lista, pool, jitter, agendamento, consent LGPD; [[Validação Pool×Grupo]]; estimativa de duração |
| `/campaigns/:id` | Detalhe — resumo por IA (SSE), runs, distribuição por número; launch/pause/cancel |
| `/campaigns/:id/edit` | Edita draft |
| `/templates` | Lista + criação com detecção de `{{nome}}`; risk-check IA; "✨ Gerar com IA" |
| `/groups` | Grupos sincronizados, filtro por número, "Sincronizar este número" |
| `/contacts` | Contatos com busca por nome/jid e origem |
| `/lists` | Duas colunas: listas + membros (checkboxes) |
| `/reports` | Tabela agregada por número (status, enviadas, falhas, limite, hoje) |
| `/inbound` | Blocklist + mensagens recebidas; classificação automática; reclassificar manual |

## Componentes

**UI primitivos** (`components/ui/`): `Button`, `Input`/`Select`/`Textarea`, `Field`, `Card`, `Badge`, `Table` (+ `THead`/`TBody`/`Th`/`Td`/`Tr`/`EmptyRow`), `PageHeader`, `Alert`, `EmptyState`, `Term` (ver [[Glossário UX]]).

**De feature** (`components/`): `AiRiskBadge`, `AiSuggestionChip`, `AiGenerateModal` (ver [[Features de IA]]), `Sidebar`.

## Hooks e cliente HTTP

`lib/use-ai-risk.ts` — `useAiRisk(text, category, debounceMs=600)`, chama `POST /ai/risk-check`, retorna estado `idle|loading|ok|error|unavailable`.

`lib/api.ts` — cliente único (`get/post/put/delete`), `API_URL = NEXT_PUBLIC_API_URL ?? "http://localhost:3000"`. **Sempre estender aqui** ao adicionar endpoints. Tipos front/back ficam **duplicados** aqui (não há eden treaty ainda): `Account`, `Contact`, `Group`, `List`, `Template`, `Campaign`, `ValidationResult`.

## CSS / Tailwind 4

`globals.css` faz `@import "tailwindcss"` e define tokens em `@theme` (inclui cores `--color-brand-*`). **Não** existe `tailwind.config.js`. Use o helper `cn()` de `lib/cn.ts` para classes condicionais.
