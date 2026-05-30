---
title: BulkZap — Mapa de Conteúdo
tags: [moc, bulkzap, home]
aliases: [Home, Índice, MOC]
updated: 2026-05-29
---

# 🚀 BulkZap

> [!abstract] O que é
> Plataforma de disparos WhatsApp em **grupos** (não DMs em massa) com anti-ban, fallback Cloud API e camada de IA. **Single-tenant**, cliente único hoje — evolução pretendida para SaaS.

> [!info] Premissa central
> O usuário precisa poder cadastrar um número novo e disparar para **100 grupos no mesmo dia**. Anti-ban é **opt-in** e **avisa, nunca bloqueia** — exceto a [[Validação Pool×Grupo]], que é o único *gate*.

## 🗺️ Mapa de conteúdo

### Arquitetura
- [[Visão Geral]] — o sistema de ponta a ponta, fluxo de dados
- [[Stack]] — tecnologias e versões
- [[Decisões de Arquitetura]] — as 8 decisões críticas e seus porquês

### Backend (`apps/api`)
- [[API REST]] — todos os endpoints REST por domínio
- [[WebSocket e QR]] — conexão em tempo real e QR code
- [[Drivers de WhatsApp]] — Baileys vs Cloud API
- [[Jobs e Filas]] — BullMQ, workers, cron
- [[Account Manager]] — singleton de drivers em runtime

### Anti-ban
- [[Sistema Anti-ban]] — warmup, limites, jitter, rotação, pausa por ban
- [[Validação Pool×Grupo]] — o único hard block

### Inteligência Artificial
- [[Features de IA]] — risk-check, gerador, sugestão, resumo, classificador

### Dados
- [[Schema do Banco]] — todas as tabelas Drizzle e relações

### Frontend (`apps/web`)
- [[Frontend]] — páginas Next.js, componentes, hooks
- [[Glossário UX]] — sistema de tooltips `<Term>`

## 🧭 Atalhos rápidos

| Quero ver… | Vai em… |
|---|---|
| Schema completo do banco | [[Schema do Banco]] |
| Lógica de envio (jitter, rotação) | [[Sistema Anti-ban]] + [[Jobs e Filas]] |
| Como o Baileys conecta | [[Drivers de WhatsApp]] |
| Pool de drivers em runtime | [[Account Manager]] |
| Endpoints REST | [[API REST]] |
| Prompts de IA | [[Features de IA]] |
| Tooltips de termos | [[Glossário UX]] |

## ⚙️ Setup rápido

```bash
brew install bun redis
brew services start redis
docker compose up -d                  # APENAS Postgres em dev
cp .env.example .env
bun install
cd packages/db && bun run db:migrate
cd ../.. && bun run dev               # api (3000) + web (3001)
```

Acessos: API `http://localhost:3000` · Web `http://localhost:3001` · Filas `http://localhost:3000/admin/queues`

> [!note] Sobre esta documentação
> Vault Obsidian gerado a partir da leitura do código-fonte em `2026-05-29`. Os fatos (constantes, status codes, modelos, schema) foram extraídos diretamente dos arquivos `.ts`. Em caso de divergência, o código é a autoridade.
