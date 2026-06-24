import { Elysia, t } from "elysia";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  campaignRuns,
  campaigns,
  messages,
  templates,
} from "@bulk-zap/db";
import { db } from "../db.js";
import { authPlugin } from "../lib/auth-middleware.js";
import {
  AiUnavailableError,
  MODEL_HAIKU,
  MODEL_SONNET,
  PROMPT_VERSION,
  completeJson,
  getCachedJson,
  hashKey,
  isAiAvailable,
  setCachedJson,
  streamText,
} from "../services/ai.service.js";

const RISK_CHECK_SYSTEM = `Você é um especialista em prevenção de banimento no WhatsApp. Avalia mensagens em português para identificar gatilhos de spam detection da Meta.

Sinais de alto risco (score 7-10):
- Excesso de CAPS LOCK
- Excesso de emojis ou pontuação (!!!, 🔥🔥🔥)
- Palavras-chave promocionais em peso ("URGENTE", "GRÁTIS", "CLIQUE AGORA", "OFERTA IMPERDÍVEL")
- Pedidos para clicar em link encurtado sem contexto
- Ausência de personalização (sem variáveis como {{nome}})
- Texto idêntico para muitos destinatários (mensagem genérica)

Sinais de baixo risco (score 1-3):
- Tom conversacional
- Personalização com variáveis
- Conteúdo informativo ou de atendimento
- Pontuação normal

Responda APENAS com JSON válido neste formato exato:
{"riskScore": <1-10>, "reasons": ["motivo curto 1", "motivo curto 2"], "suggestions": ["sugestão 1", "sugestão 2"]}

Máximo 3 reasons e 3 suggestions. Cada string curta (até 80 chars).`;

type RiskCheckResult = {
  riskScore: number;
  reasons: string[];
  suggestions: string[];
};

const TEMPLATE_GENERATOR_SYSTEM = `Você é especialista em copywriting para WhatsApp focado em evitar banimento. Gera mensagens em português brasileiro que:

- Soam conversacionais, não promocionais agressivas
- Usam {{nome}} de forma natural (no início, como saudação)
- Evitam CAPS LOCK, excesso de emojis, gatilhos de spam ("URGENTE", "GRÁTIS", "CLIQUE AGORA")
- Têm 1-3 frases curtas, no máximo 280 caracteres
- Variam entre si em estrutura e tom

Responda APENAS com JSON neste formato exato:
{"variations": ["texto 1", "texto 2", "texto 3"]}

Exatamente 3 variações.`;

const TEMPLATE_VARIANTS_SYSTEM = `Você reescreve uma mensagem do WhatsApp em 5 variações que preservam intenção e CTA, mas variam vocabulário, ordem das frases e tom. Objetivo: reduzir spam detection por repetição.

Mantenha {{variáveis}} se existirem.

Responda APENAS com JSON neste formato:
{"variations": ["variação 1", "variação 2", "variação 3", "variação 4", "variação 5"]}`;

type GenerateResult = { variations: string[] };

const CAMPAIGN_SUGGEST_SYSTEM = `Você é especialista em mitigação de ban no WhatsApp. Dada a configuração de uma campanha, recomenda jitter e tamanho de pool ideais para reduzir risco de ban.

Regras:
- Marketing em grupos é o caso de maior risco; sugira jitter ≥60s e pool ≥3 quando volume > 50.
- Transacional/atendimento podem usar jitter menor (15-45s).
- Números sem warmup (warmupMode=off) e/ou novos (daysOld<7) aumentam risco; sugira mais jitter.
- Horários comerciais (9-18h) são mais seguros.

Responda APENAS com JSON:
{"jitterMinMs": <ms>, "jitterMaxMs": <ms>, "recommendedPoolSize": <int>, "reasoning": "explicação curta em PT-BR (2-3 frases)"}`;

type CampaignSuggestion = {
  jitterMinMs: number;
  jitterMaxMs: number;
  recommendedPoolSize: number;
  reasoning: string;
};

type PoolAccountInfo = {
  warmupMode: "off" | "auto" | "manual";
  dailyUsed: number;
  dailyLimit: number | null;
  status: string;
  daysOld: number;
};

const CAMPAIGN_SUMMARY_SYSTEM = `Você resume execuções de campanhas WhatsApp em 2-4 frases curtas em português brasileiro, destacando:
- Volume e taxa de sucesso
- Anomalias por número (se algum teve muito mais falha)
- Recomendação acionável curta no final

Tom conversacional. Não use bullet points. Não invente dados.`;

async function checkRisk(text: string, category: string) {
  return completeJson<RiskCheckResult>({
    model: MODEL_HAIKU,
    systemPrompt: RISK_CHECK_SYSTEM,
    userPrompt: `Categoria: ${category}\nMensagem:\n"""\n${text}\n"""`,
    temperature: 0.2,
    maxTokens: 400,
  });
}

async function generateWithSafetyCheck(
  systemPrompt: string,
  userPrompt: string,
  category: string,
  maxRetries = 2
): Promise<string[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await completeJson<GenerateResult>({
      model: MODEL_SONNET,
      systemPrompt,
      userPrompt,
      temperature: attempt === 0 ? 0.8 : 0.5,
      maxTokens: 1024,
    });

    const variations = (result.variations ?? []).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    if (variations.length === 0) continue;

    const risks = await Promise.all(
      variations.map((v) => checkRisk(v, category).catch(() => null))
    );
    const safe = variations.filter((_, i) => {
      const r = risks[i];
      return !r || r.riskScore <= 7;
    });
    if (safe.length >= Math.min(variations.length, 1) && attempt === maxRetries)
      return safe.length > 0 ? safe : variations;
    if (safe.length === variations.length) return variations;
  }
  return [];
}

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .use(authPlugin)
  // health is public-ish but cheap; keep it behind auth for consistency.
  .get("/health", () => ({ available: isAiAvailable() }), { auth: true })

  .post(
    "/risk-check",
    async ({ body }) => {
      const cacheKey = hashKey([
        "risk-check",
        PROMPT_VERSION,
        body.text,
        body.category ?? "outros",
      ]);
      const cached = await getCachedJson<RiskCheckResult>(cacheKey);
      if (cached) return { ...cached, cached: true };

      const result = await completeJson<RiskCheckResult>({
        model: MODEL_HAIKU,
        systemPrompt: RISK_CHECK_SYSTEM,
        userPrompt: `Categoria: ${body.category ?? "outros"}\nMensagem:\n"""\n${body.text}\n"""`,
        temperature: 0.2,
        maxTokens: 400,
      });

      result.riskScore = Math.max(1, Math.min(10, Math.round(result.riskScore)));
      result.reasons = (result.reasons ?? []).slice(0, 3);
      result.suggestions = (result.suggestions ?? []).slice(0, 3);

      await setCachedJson(cacheKey, result);
      return { ...result, cached: false };
    },
    {
      auth: true,
      body: t.Object({
        text: t.String({ minLength: 1, maxLength: 4000 }),
        category: t.Optional(
          t.Union([
            t.Literal("marketing"),
            t.Literal("transacional"),
            t.Literal("atendimento"),
            t.Literal("outros"),
          ])
        ),
      }),
    }
  )

  .post(
    "/templates/generate",
    async ({ body }) => {
      const userPrompt = `Contexto: ${body.description}\nCategoria: ${body.category}${body.tone ? `\nTom: ${body.tone}` : ""}`;
      const variations = await generateWithSafetyCheck(
        TEMPLATE_GENERATOR_SYSTEM,
        userPrompt,
        body.category
      );
      return { variations };
    },
    {
      auth: true,
      body: t.Object({
        description: t.String({ minLength: 5, maxLength: 500 }),
        category: t.Union([
          t.Literal("marketing"),
          t.Literal("transacional"),
          t.Literal("atendimento"),
          t.Literal("outros"),
        ]),
        tone: t.Optional(t.String({ maxLength: 50 })),
      }),
    }
  )

  .post(
    "/campaign/suggest",
    async ({ body }) => {
      const userPrompt = `Categoria: ${body.category}
Tipo de lista: ${body.listType}
Total de destinatários: ${body.listSize}
Hora do dia: ${body.hourOfDay}
Pool de números:
${body.poolAccounts
  .map(
    (a, i) =>
      `  #${i + 1}: warmup=${a.warmupMode}, status=${a.status}, dailyUsed=${a.dailyUsed}/${a.dailyLimit ?? "∞"}, daysOld=${a.daysOld}`
  )
  .join("\n")}`;

      return await completeJson<CampaignSuggestion>({
        model: MODEL_SONNET,
        systemPrompt: CAMPAIGN_SUGGEST_SYSTEM,
        userPrompt,
        temperature: 0.3,
        maxTokens: 500,
      });
    },
    {
      auth: true,
      body: t.Object({
        category: t.Union([
          t.Literal("marketing"),
          t.Literal("transacional"),
          t.Literal("atendimento"),
          t.Literal("outros"),
        ]),
        listType: t.Union([t.Literal("contacts"), t.Literal("groups")]),
        listSize: t.Integer({ minimum: 0 }),
        hourOfDay: t.Integer({ minimum: 0, maximum: 23 }),
        poolAccounts: t.Array(
          t.Object({
            warmupMode: t.Union([
              t.Literal("off"),
              t.Literal("auto"),
              t.Literal("manual"),
            ]),
            dailyUsed: t.Integer({ minimum: 0 }),
            dailyLimit: t.Nullable(t.Integer({ minimum: 0 })),
            status: t.String(),
            daysOld: t.Integer({ minimum: 0 }),
          })
        ),
      }),
    }
  )

  .post(
    "/templates/:id/variants",
    async ({ params, organizationId }) => {
      const [tpl] = await db
        .select()
        .from(templates)
        .where(
          and(
            eq(templates.id, params.id),
            eq(templates.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!tpl) return new Response("template not found", { status: 404 });

      const variations = await generateWithSafetyCheck(
        TEMPLATE_VARIANTS_SYSTEM,
        `Mensagem original:\n"""\n${tpl.body}\n"""`,
        "outros"
      );
      return { variations };
    },
    { auth: true, params: t.Object({ id: t.String() }) }
  )

  .get(
    "/campaign/:id/summary",
    async ({ params, set, organizationId }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, params.id),
            eq(campaigns.organizationId, organizationId)
          )
        )
        .limit(1);
      if (!campaign) {
        set.status = 404;
        return new Response("campaign not found", { status: 404 });
      }
      const [latestRun] = await db
        .select()
        .from(campaignRuns)
        .where(eq(campaignRuns.campaignId, params.id))
        .orderBy(desc(campaignRuns.startedAt))
        .limit(1);
      if (!latestRun) {
        set.status = 400;
        return new Response("no runs yet", { status: 400 });
      }

      const breakdown = await db
        .select({
          accountId: messages.accountId,
          status: messages.status,
          count: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(eq(messages.campaignRunId, latestRun.id))
        .groupBy(messages.accountId, messages.status);

      const userPrompt = `Campanha: ${campaign.name} (categoria ${campaign.category})
Execução iniciada em ${latestRun.startedAt.toISOString()}
Total alvos: ${latestRun.totalTargets}
Enviadas: ${latestRun.sentCount}
Falhas: ${latestRun.failedCount}
Distribuição por número:
${breakdown
  .map((b) => `  - ${b.accountId}: ${b.status} = ${b.count}`)
  .join("\n")}`;

      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of streamText({
                model: MODEL_SONNET,
                systemPrompt: CAMPAIGN_SUMMARY_SYSTEM,
                userPrompt,
                temperature: 0.5,
                maxTokens: 500,
              })) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text: chunk })}\n\n`
                  )
                );
              }
              controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            } catch (err) {
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`
                )
              );
            }
            controller.close();
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        }
      );
    },
    { auth: true, params: t.Object({ id: t.String() }) }
  )

  .onError(({ error, set }) => {
    if (error instanceof AiUnavailableError) {
      set.status = 503;
      return { error: "ai_unavailable", message: error.message };
    }
  });
