---
title: Drivers de WhatsApp
tags: [backend, baileys, cloud-api, drivers]
updated: 2026-05-29
---

# Drivers de WhatsApp

Voltar para [[BulkZap]]. Arquivos: `apps/api/src/drivers/whatsapp-driver.ts`, `baileys-driver.ts`, `cloud-api-driver.ts`.

## Interface

```ts
interface WhatsAppDriver {
  readonly accountId: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;
  sendText(to: string, text: string): Promise<SendResult>;
  deleteMessage(to: string, providerMsgId: string): Promise<void>;
  listGroups(): Promise<GroupSummary[]>;
  isMemberOfGroup(jid: string): Promise<boolean>;
  on(listener: DriverListener): () => void;
}
```

Eventos emitidos: `qr`, `connecting`, `connected`, `disconnected`, `banned`, `contacts-updated`, `groups-updated`, `inbound-message`.

## BaileysDriver

Suporta **tudo**, incluindo grupos. Auth via `usePostgresAuthState()` — sessões em Postgres, nunca filesystem (ver [[Decisões de Arquitetura]] #1).

Filtra JIDs não-pessoais em inbound: `@g.us`, `status@broadcast`, `@newsletter`, `@broadcast`.

Detecção de ban e reconnect (ver [[Sistema Anti-ban]]):
- `BAN_STATUS_CODES = {401, 403, 440, 515}`, `loggedOut`, `connectionReplaced` → emite `banned`, para o reconnect.
- Outras quedas → backoff exponencial `min(3000 * 2^n, 60_000)`.

> [!warning] `bun --watch` reinicia a sessão a cada save
> O socket morre e reconecta, e o celular pareado notifica "sincronização concluída". Em dev com número pareado, prefira `cd apps/api && bun run start` (sem watch).

## CloudApiDriver

DMs apenas, via Graph API v22.0 (`POST https://graph.facebook.com/v22.0/{phoneNumberId}/messages`). Implementa só `sendText`. Lança `UnsupportedOperationError` em `deleteMessage`, `listGroups` e `isMemberOfGroup`.

> [!danger] Cloud API NÃO faz grupos
> Para o caso de uso principal (cliente atual), **Baileys é o único caminho**. A UI esconde features de grupo quando `driver = cloud_api`.

## Adicionar um driver novo

1. Implementar a interface `WhatsAppDriver`.
2. Adicionar valor ao enum `whatsapp_driver` (ver [[Schema do Banco]]) e migrar.
3. Em [[Account Manager]] (`account-manager.service.ts`), escolher o driver por `account.driver`.

Convenção ESM/NodeNext: imports relativos usam extensão `.js` mesmo em arquivos `.ts`. Não remova.
