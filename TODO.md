# TODO — BulkZap

Estado: branch `feat/auth-billing` (PR #1) adicionou auth + billing + multi-tenancy
+ correções de segurança + créditos não-expiráveis/auto-recarga. **Feature-completo,
mas pendente de validação contra banco/MP real.**

---

## 1. Validação (fazer ANTES de novas features) — dívida desta branch

Nada nesta branch rodou contra Postgres/MP de verdade nesta sessão (sem ambiente).

- [ ] Subir stack local: `docker compose up -d` + redis + `cd packages/db && bun run db:migrate` (aplica `0003` e `0004`) + `bun run dev`
- [ ] E2e isolamento cross-tenant — script pronto em `scratchpad/verify-isolation.ts` (2 orgs; A não usa contas/alvos de B)
- [ ] E2e billing pré-pago: signup → verificar email → assinar → estourar franquia → comprar crédito → confirmar saldo persistente
- [ ] E2e cartão/auto-recarga no **sandbox do Mercado Pago** (card-on-file — ponto de MAIOR risco; pode ser recusado sem CVV)
- [ ] Confirmar bloqueio: `402 billing_blocked` no launch sem plano + re-check por mensagem no worker

---

## 2. Bloqueio de envio sem plano (= parte do onboarding)

**Comportamento atual (confirmado no código):** sem assinatura `authorized`,
`canDispatch` retorna `no_subscription` e **bloqueia o envio** em dois pontos:
- pré-flight em `POST /campaigns/:id/launch` → `402 billing_blocked` (`campaigns.ts:165`)
- re-check por mensagem no worker `send-message.job.ts` → marca `billing_blocked:no_subscription`

Ou seja: **org nova sem plano não dispara nada.** Isso é o gate de onboarding.

- [x] **Onboarding guiado (checklist híbrido)** — `GET /onboarding/status` +
      `OnboardingChecklist` no dashboard: 5 passos (assinar → conectar número →
      lista → template → 1ª campanha), "assinar" destacado como gate do disparo;
      some quando completo. _(branch `feat/onboarding`)_
- [x] **UX do bloqueio** — banner "Assine para disparar" com CTA pra `/billing`
      em `/campaigns/new`.
- [ ] _(futuro)_ Onboarding **conversacional** (IA guiando o setup) — hoje é
      checklist; evoluir pra chat só se fizer sentido com mais clientes.

---

## 3. Features do roadmap (pós-MVP) ainda NÃO construídas

- [ ] **Mídia (imagens/áudios/documentos)** — driver só tem `sendText`
      (`whatsapp-driver.ts:34`). Estender a interface `WhatsAppDriver` + `BaileysDriver`
      + UI de template/campanha. _(maior impacto pro caso de uso — disparo em grupo só com texto é limitado)_
- [ ] **Webhooks de saída** — notificar sistemas externos em eventos
      (mensagem enviada, inbound classificado, ban, desconexão). Hoje só existe webhook
      de ENTRADA do Mercado Pago.
- [ ] **Re-QR automático com push** — o re-QR no logout já existe (limpa creds e pede QR),
      mas falta **push** avisando o cliente pra reescanear.
- [ ] **Painel de qualidade do número** — nada de `quality` hoje (score de saúde,
      histórico de bans/desconexões, sinais de risco).

---

## 4. Estratégico (decisão de produto, sem urgência)

- [ ] **Repensar o eixo de preço** — cobrar por "número saudável / não tomar ban" em vez
      de por volume de mensagens (decisão do conselho; o valor real é anti-ban, não throughput).
      Revisitar com 5+ clientes.
