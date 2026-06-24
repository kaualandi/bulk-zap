---
title: Glossário UX
tags: [frontend, ux, glossário]
aliases: [Glossário, Term]
updated: 2026-05-29
---

# Glossário UX

Voltar para [[BulkZap]]. Arquivos: `apps/web/src/lib/glossary.ts` + `components/ui/term.tsx`.

Termos técnicos ganham tooltip inline. Não invente novo padrão — use o existente.

## Como usar

1. Adicione a definição em `lib/glossary.ts`:

```ts
export const glossary: Record<string, GlossaryEntry> = {
  jitter: { title: "Jitter", description: "Delay aleatório entre envios..." },
  // ...
};
```

2. Use `<Term k="jitter" />` em qualquer JSX. Aceita `children` para texto customizado e `className`.

```tsx
<Term k="jitter" />              {/* renderiza "jitter ⓘ" com tooltip */}
<Term k="jitter">o delay</Term>  {/* texto custom, mesma definição */}
```

## Comportamento

Tooltip é **CSS puro** (`group-hover` + `group-focus-within`), sem JS extra. Acessível por teclado (`tabIndex={0}`, `focus-visible:ring`). Fundo escuro (`bg-zinc-900`), texto branco.

Padrão visual nas páginas: linha "Termos: A · B · C · …" logo abaixo do `<PageHeader>`. Ex.: `/campaigns/new` expõe template, pool, jitter, marketing, validação pool×grupo, LGPD.

Veja também [[Frontend]].
