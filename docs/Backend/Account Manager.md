---
title: Account Manager
tags: [backend, singleton, runtime, baileys]
updated: 2026-05-29
---

# Account Manager

Voltar para [[BulkZap]]. Arquivo: `apps/api/src/services/account-manager.service.ts`.

Singleton em memória que mantém os drivers vivos entre requests.

```ts
const drivers      = new Map<string, WhatsAppDriver>();
const lastQr       = new Map<string, string>();
const broadcasters = new Map<string, Set<DriverListener>>();
```

## Ciclo de vida

- `startAccount(accountId)` — cria um [[Drivers de WhatsApp|BaileysDriver]], registra um listener que captura todos os eventos e chama `driver.connect()`.
- `bootAllConnected()` — no boot do app, percorre as contas Baileys e chama `startAccount` para todas que **não** estão `banned`.
- `subscribe(accountId, cb)` — usado pelo [[WebSocket e QR]] para re-emitir eventos aos clients.

## O que cada evento atualiza

| Evento | Ação |
|---|---|
| `qr` | guarda em `lastQr`, registra `qr_required` |
| `connecting` | `status = connecting` |
| `connected` | `status = connected`, apaga QR, registra evento, faz refresh de grupos |
| `disconnected` | `status = disconnected` + `lastConnectionError` |
| `banned` | `status = banned`, registra evento, **remove o driver do Map** |
| `contacts-updated` | `upsertSyncedContacts()` |
| `groups-updated` | `upsertSyncedGroups()` |
| `inbound-message` | insere em `inbound_messages` e enfileira `classify-inbound` |

`setStatus()` atualiza `status` + `lastConnectionError` + `lastSeenAt` (quando connected) em `whatsapp_accounts`.

Veja também [[Schema do Banco]] (`whatsapp_accounts`, `events`, `contacts`, `group_memberships`, `inbound_messages`), [[Jobs e Filas]] e [[Sistema Anti-ban]] (propagação do ban).
