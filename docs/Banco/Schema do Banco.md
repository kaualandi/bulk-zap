---
title: Schema do Banco
tags: [banco, drizzle, postgres, schema]
updated: 2026-05-29
---

# Schema do Banco

Voltar para [[BulkZap]]. Autoridade: `packages/db/src/schema/*.ts`, agregado em `index.ts`.

Postgres 16 + Drizzle 0.45.2 (`dialect: postgresql`, `strict: true`). Conexão via `DATABASE_URL` (default `postgres://bulkzap:bulkzap@localhost:5432/bulkzap`). 16 tabelas (incluindo 2 de relacionamento).

## Diagrama de relações

```mermaid
erDiagram
    whatsapp_accounts ||--|| baileys_creds : "1:1 cascade"
    whatsapp_accounts ||--o{ baileys_keys : "cascade"
    whatsapp_accounts ||--o{ contacts : "set null"
    whatsapp_accounts ||--o{ group_memberships : "cascade"
    whatsapp_accounts ||--o{ messages : "restrict"
    whatsapp_accounts ||--o{ events : "set null"
    whatsapp_accounts ||--o{ inbound_messages : "cascade"
    groups ||--o{ group_memberships : "cascade"
    templates ||--o{ campaigns : "restrict"
    lists ||--o{ campaigns : "restrict"
    lists ||--o{ list_members : "cascade"
    campaigns ||--o{ campaign_runs : "cascade"
    campaign_runs ||--o{ messages : "cascade"
```

## Tabelas

### whatsapp_accounts — `whatsapp-accounts.ts`
Contas WhatsApp (Baileys ou Cloud API). PK `id` (uuid). Campos-chave: `driver` (`baileys|cloud_api`, default `baileys`), `status` (`disconnected|connecting|connected|banned`), `warmupMode` (`off|auto|manual`), `dailyLimit` (int, **nullable**), `dailyUsed` (default 0), `dailyResetAt`, `warmupStartedAt`, `phoneE164`, `displayName`, `lastConnectionError`, `lastSeenAt`, `cloudApiPhoneId`, `cloudApiTokenCipher`. Central — referenciada por quase tudo. Ver [[Sistema Anti-ban]].

### baileys_creds — `baileys-auth.ts`
Credenciais Baileys. PK = FK `accountId` → whatsapp_accounts (cascade). `creds` jsonb. Ver [[Decisões de Arquitetura]] #1.

### baileys_keys — `baileys-auth.ts`
Chaves Baileys. **PK composta** `(accountId, type, keyId)`, FK `accountId` (cascade). `value` jsonb.

### contacts — `contacts.ts`
Contatos individuais. PK `id`. FK `accountId` (**set null**). `jid`, `name`, `pushName`, `source` (`whatsapp_sync|csv_import|manual`). Unique `(jid, accountId)`.

### groups — `groups.ts`
Grupos WhatsApp. PK `id`. `jid` (unique), `subject`, `participantsCount`, `lastSyncedAt`.

### group_memberships — `groups.ts`
Associação número×grupo. **PK composta** `(groupId, accountId)`, ambas FK (cascade). `syncedAt`. Base da [[Validação Pool×Grupo]].

### lists — `lists.ts`
Listas de alvos. PK `id`. `name`, `type` (`contacts|groups`).

### list_members — `lists.ts`
Membros de lista. **PK composta** `(listId, targetType, targetId)`. `targetType` (`contact|group`). FK `listId` (cascade).

### templates — `templates.ts`
Templates de mensagem. PK `id`. `name`, `body`, `variables` (jsonb `string[]`, default `[]`). Variáveis extraídas por regex `{{nome}}`.

### campaigns — `campaigns.ts`
Campanhas. PK `id`. `category` (`marketing|transacional|atendimento|outros`, default `outros`), FK `templateId` (**restrict**), FK `listId` (**restrict**), `accountPoolIds` (jsonb `string[]`), `scheduleAt`, `jitterMinMs` (default 15000), `jitterMaxMs` (default 90000), `dailyCapPerAccount`, `status` (`draft|scheduled|running|paused|completed|failed|canceled`, default `draft`), `marketingConsentConfirmed`.

### campaign_runs — `campaigns.ts`
Execuções. PK `id`. FK `campaignId` (cascade). `startedAt`, `finishedAt`, `status`, `totalTargets`, `sentCount`, `failedCount`.

### messages — `messages.ts`
Mensagens enviadas. PK `id`. FK `campaignRunId` (cascade), FK `accountId` (**restrict**). `targetJid`, `targetType` (`contact|group`), `body`, `status` (`queued|sent|delivered|read|failed|canceled`), `error`, `bullJobId`, `providerMsgId`, `sentAt`, `deliveredAt`, `readAt`. Índices: `(campaignRunId)`, `(accountId)`, `(status)`.

### events — `events.ts`
Eventos de conta/sistema. PK `id`. FK `accountId` (**set null**). `type` (`connected|disconnected|banned|qr_required|qr_scanned|warmup_advanced|message_failed|campaign_high_failure_rate|schedule_missed`), `payload` jsonb, `notified` (default false). Índices `(accountId, type)`, `(createdAt)`.

### email_subscriptions — `email-subscriptions.ts`
Inscrições de email (Resend). PK `id`. `email` (unique), `eventTypes` (jsonb `string[]`), `active` (default true).

### contact_blocklist — `contact-blocklist.ts`
Bloqueados. PK `id`. `jid` (unique), `reason`, `source` (`auto_opt_out|manual|imported`). Alimentada pelo [[Features de IA|classificador inbound]].

### inbound_messages — `inbound-messages.ts`
Mensagens recebidas. PK `id`. FK `accountId` (cascade). `fromJid`, `text`, `classification` (`opt_out|interesse|duvida|reclamacao|outro`, nullable), `confidence` (double, nullable), `classifiedAt`. Índices `(accountId)`, `(classification)`.

## Convenções

- Todas as PKs são uuid `defaultRandom()`; timestamps `with time zone` default `now()`.
- Sem soft deletes — deletes são hard ou cascateados.
- Sempre exporte `$inferSelect` e `$inferInsert` ao fim de cada arquivo.
- Composite PKs via `primaryKey({ columns: [...] })`.

## Migrations

Em `packages/db/drizzle/` (journal v7). Aplicadas: `0000_flat_baron_zemo` (inicial), `0001_married_anita_blake` (add `contact_blocklist` + `inbound_messages`), `0002_young_the_initiative` (add `canceled` em campaign/message status + `messages.provider_msg_id`).

```bash
cd packages/db
bun run db:generate   # gera SQL a partir do schema
bun run db:migrate    # aplica pendentes
bun run db:studio     # UI
```

> [!tip] Adicionar tabela nova
> 1. Criar `packages/db/src/schema/nome.ts` (table + tipos inferidos).
> 2. `export * from "./nome.js"` em `index.ts`.
> 3. `bun run db:generate && bun run db:migrate`.
