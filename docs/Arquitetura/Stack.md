---
title: Stack
tags: [arquitetura, stack]
updated: 2026-05-29
---

# Stack

Voltar para [[BulkZap]] · ver [[Visão Geral]].

| Camada | Tech | Notas |
|---|---|---|
| Runtime | Bun 1.3+ | Não trocar para Node sem testar Baileys |
| Monorepo | Bun workspaces + Turborepo | `apps/*` + `packages/*` |
| API | ElysiaJS + TypeScript | REST + WebSocket nativo |
| ORM | Drizzle 0.45.2 | Schema em `packages/db` — ver [[Schema do Banco]] |
| Banco | Postgres 16 | Docker em dev, nativo na EC2 prod |
| Fila | BullMQ + Redis | Redis local (brew) em dev, nativo em prod |
| Frontend | Next.js 16 (App Router) + Tailwind 4 | Tailwind 4 sem config file — tokens em `globals.css` |
| WhatsApp | `@whiskeysockets/baileys` 7.x | Driver principal — único que faz grupos |
| Cloud API | fetch direto pro Graph API v22.0 | Adapter `cloud-api-driver.ts` |
| Email | Resend | Alertas de ban/desconexão |
| IA | Anthropic SDK (Haiku 4.5 + Sonnet 4.6) | Tudo opt-in via `ANTHROPIC_API_KEY` |
| Admin filas | Bull Board (Hono adapter) | `/admin/queues` com basic auth |
| Deploy | 1 EC2 + PM2 | **Sem Docker em prod** |

## Modelos de IA

| Constante | String | Uso |
|---|---|---|
| `MODEL_HAIKU` | `claude-haiku-4-5` | classificação rápida e barata (~$0.0005/req) |
| `MODEL_SONNET` | `claude-sonnet-4-6` | geração criativa (~$0.003–0.005/req) |

## Comandos essenciais

```bash
# Raiz
bun run dev              # turbo: api + web
bun run build
bun run check-types
bun run lint

# packages/db (após mudar schema)
bun run db:generate
bun run db:migrate
bun run db:studio

# apps/api
curl http://localhost:3000/health
curl http://localhost:3000/ai/health     # {available: bool}
```

> [!tip] Tailwind 4 sem config file
> Se uma classe não funcionar, verifique os tokens em `globals.css` no bloco `@theme` — **não existe** `tailwind.config.js`.
