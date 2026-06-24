# TODO — BulkZap

Estado: branch `feat/auth-billing` (PR #1) adicionou auth + billing + multi-tenancy
+ correções de segurança + créditos não-expiráveis/auto-recarga + onboarding
(PRs #1 e #2, ambos mergeados no main). **Feature-completo, mas NADA rodou contra
banco/MP real — só typecheck.**

---

## 0. 🚩 Veredito do conselho — NÃO é MVP lançável ainda (fazer antes de cobrar)

Conselho (`/council`) avaliou se dá pra lançar pro cliente real pagar. Veredito:
**não.** O escopo até sobra; o que falta é VALIDAR o núcleo (não tomar ban +
cobrar) contra a realidade, e há bugs reais achados no código. "Lançável" pra 1
cliente = **um número sobrevive 48h disparando em grupos reais sem `403`, e o
dinheiro entra** — não é lançamento público de SaaS.

### Bugs reais (verificados no código)
- [ ] **Gate pool×grupo NÃO é aplicado no disparo.** `validatePoolGroupMembership`
      só roda na rota read-only `/validate` (`campaigns.ts:105`); `launchCampaign`
      NÃO chama. Contradiz o CLAUDE.md (gotcha #5, "hard block"). Disparar em grupo
      onde o número não é membro → falha por target → **sinal de ban**. Corrigir:
      chamar a validação no launch e retornar 402/erro se algum número do pool não
      for membro de algum grupo alvo.
- [ ] **`recordDispatch` roda DEPOIS do `sendText`, sem transação** — crash entre
      enviar e contabilizar = mensagem enviada e não cobrada. Tornar atômico.
- [ ] **Auto-recarga recusada só vira `logger.warn`** — saldo zera e o disparo
      morre em silêncio. Notificar o cliente (email/UI) e não deixar falhar calado.
- [ ] **Anti-ban sem throttle por idade de número.** Número novo no default
      (`warmupMode=off`, `dailyLimit=null`) = ilimitado. É exatamente o cenário de
      ban do cliente, nunca medido. Considerar teto conservador no dia 1.

### Validação mínima — "ligar o motor" (não dá pra pular)
- [ ] E2e real ponta-a-ponta: subir stack (PG + redis + `db:migrate` 0003/0004) +
      **túnel (ngrok) pra `notification_url` do webhook MP** + sandbox MP com cartão
      de teste + **parear número real via QR** + disparar em 3-5 grupos reais de
      teste + **medir ban em 24-48h** + conferir débito de crédito no relatório.
- [ ] ⚠️ Migrations multi-tenant **nunca aplicadas** — podem falhar em banco já
      populado (`organization_id NOT NULL` sem backfill). Testar num dump real.

### Estratégico (do conselho)
- [ ] **Moat barato (Expansionista):** logar cada disparo com `(número, grupo,
      baniu?)` — a tabela `events` já captura o `403` — e expor "seu número está
      vivo há X dias · 0 bans". É o argumento de venda vs. DevZap.
- [ ] **Fechar o loop de inbound** (já classifica com IA): segmentar/re-disparar
      quem respondeu positivo, suprimir opt-out automático. Vira mini-CRM de grupo.
- Nota (Primeiros Princípios): billing-MP/auto-recarga/multi-tenancy são
      over-engenharia pra 1 cliente (Pix manual bastaria), mas JÁ estão prontos —
      só não invista MAIS nisso antes de validar o núcleo.

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
