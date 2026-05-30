---
title: Validação Pool×Grupo
tags: [anti-ban, gate, campanhas, grupos]
aliases: [Validação Pool x Grupo, Pool×Grupo]
updated: 2026-05-29
---

# Validação Pool×Grupo

Voltar para [[BulkZap]]. Arquivo: `apps/api/src/services/group-validation.service.ts`.

> [!danger] Este é o ÚNICO hard block do sistema
> Diferente do [[Sistema Anti-ban]] (que só avisa), a validação pool×grupo **impede** uma campanha em grupos de sair de `draft` se algum número do pool não for membro de algum grupo alvo.

## O que valida

Para cada **grupo** na lista alvo, verifica se **cada conta do pool** é membro dele. Constrói uma matriz de células:

```ts
type ValidationCell = {
  groupId: string;
  groupSubject: string;
  accountId: string;
  isMember: boolean;
};
```

A função consulta `group_memberships` filtrando por `groupId ∈ grupos` e `accountId ∈ pool`, monta um `Set` de `"groupId:accountId"` e marca cada célula.

## Resultado

```ts
type ValidationResult = {
  ok: boolean;           // true quando missing.length === 0
  cells: ValidationCell[];
  missing: ValidationCell[];  // células onde isMember === false
};
```

> [!note] Curto-circuitos (retornam `ok: true`)
> - Lista cujo `type !== "groups"` (campanha de contatos não precisa de membership).
> - Lista sem grupos, ou pool vazio.

## Onde é chamada

Endpoint `GET /campaigns/:id/validate` (ver [[API REST]]). A UI de `/campaigns/new` consome o resultado: se `ok: false`, mostra quais pares número×grupo estão faltando e bloqueia o launch. O service em si não joga exceção nem tem mensagem hardcoded — retorna a estrutura para a aplicação interpretar.

Relacionado: [[Schema do Banco]] (tabelas `groups`, `group_memberships`, `lists`, `list_members`) e [[Drivers de WhatsApp]] (`isMemberOfGroup`, sync de grupos).
