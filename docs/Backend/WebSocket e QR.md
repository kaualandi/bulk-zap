---
title: WebSocket e QR
tags: [backend, websocket, qr, baileys]
updated: 2026-05-29
---

# WebSocket e QR

Voltar para [[BulkZap]]. Arquivo: `apps/api/src/routes/accounts.ts` (`.ws()`).

Endpoint `/accounts/:id/events`. O front escuta e renderiza o QR como data URL.

## Fluxo

1. Cliente abre o WS. Se já existe um QR atual para a conta, o servidor o envia imediatamente.
2. Internamente, `subscribe(accountId, callback)` (do [[Account Manager]]) registra um listener que recebe todos os eventos do driver.
3. Eventos de QR são convertidos: `{ type: "qr", qr }` vira `{ type: "qr", qr, dataUrl }` via `QRCode.toDataURL` (pacote `qrcode`).
4. Demais eventos (`connecting`, `connected`, `disconnected`, `banned`, `contacts-updated`, `groups-updated`) são re-emitidos para todos os clients subscritos.
5. Ao fechar o WS, o `wsSubscriptions` (`Map<ws.id, unsubscribe>`) faz o cleanup do listener.

> [!info] Por que data URL
> O QR cru do Baileys é uma string; o front recebe a imagem pronta (`data:image/png;...`) e só renderiza, sem precisar de lib de QR no cliente.

Veja também [[Drivers de WhatsApp]] (de onde vêm os eventos) e [[API REST]] (`GET /accounts/:id/qr` retorna o último QR como JSON).
