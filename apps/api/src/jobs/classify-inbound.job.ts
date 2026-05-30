import { eq } from "drizzle-orm";
import { inboundMessages, whatsappAccounts } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";
import {
  MODEL_HAIKU,
  completeJson,
  isAiAvailable,
} from "../services/ai.service.js";
import { addToBlocklist } from "../services/blocklist.service.js";
import { createClassifyInboundWorker } from "./queue.js";

const CLASSIFY_SYSTEM = `Você classifica respostas de WhatsApp em português brasileiro em UMA das categorias:

- opt_out: pessoa quer parar de receber mensagens ("para", "stop", "não envie mais", "me tira", "cancelar", "não quero")
- interesse: pessoa demonstra interesse ("quero", "como faço", "tenho interesse", "manda mais info")
- duvida: pergunta sobre o produto/serviço
- reclamacao: queixa ou crítica
- outro: qualquer outra resposta

ATENÇÃO a falsos positivos de opt_out: "Para mim, perfeito" NÃO é opt_out. "Pode parar" pode ser. Use contexto.

Responda APENAS com JSON:
{"classification": "<categoria>", "confidence": <0.0-1.0>, "reasoning": "explicação curta"}

confidence reflete sua certeza. Use ≥0.8 só quando o texto for inequívoco.`;

type ClassifyResult = {
  classification: "opt_out" | "interesse" | "duvida" | "reclamacao" | "outro";
  confidence: number;
  reasoning?: string;
};

const AUTO_BLOCKLIST_THRESHOLD = 0.7;

export function startClassifyInboundWorker() {
  const worker = createClassifyInboundWorker(async (job) => {
    const { inboundMessageId } = job.data;
    const [msg] = await db
      .select()
      .from(inboundMessages)
      .where(eq(inboundMessages.id, inboundMessageId))
      .limit(1);
    if (!msg) return;
    if (msg.classification) return;

    if (!isAiAvailable()) {
      logger.debug({ inboundMessageId }, "AI unavailable, skipping classify");
      return;
    }

    try {
      const result = await completeJson<ClassifyResult>({
        model: MODEL_HAIKU,
        systemPrompt: CLASSIFY_SYSTEM,
        userPrompt: `Resposta:\n"""\n${msg.text}\n"""`,
        temperature: 0.1,
        maxTokens: 200,
      });

      const confidence = Math.max(0, Math.min(1, result.confidence));

      await db
        .update(inboundMessages)
        .set({
          classification: result.classification,
          confidence,
          classifiedAt: new Date(),
        })
        .where(eq(inboundMessages.id, inboundMessageId));

      if (
        result.classification === "opt_out" &&
        confidence >= AUTO_BLOCKLIST_THRESHOLD
      ) {
        // Resolve the owning org via the receiving account to scope the blocklist.
        const [acc] = await db
          .select({ organizationId: whatsappAccounts.organizationId })
          .from(whatsappAccounts)
          .where(eq(whatsappAccounts.id, msg.accountId))
          .limit(1);
        if (acc?.organizationId) {
          await addToBlocklist(
            acc.organizationId,
            msg.fromJid,
            `Auto opt-out (confidence ${confidence.toFixed(2)})`,
            "auto_opt_out"
          );
          logger.info(
            { jid: msg.fromJid, confidence, organizationId: acc.organizationId },
            "auto-added to blocklist"
          );
        }
      }
    } catch (err) {
      logger.error({ err, inboundMessageId }, "classify-inbound failed");
      throw err;
    }
  });

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err: err?.message }, "classify-inbound failed");
  });

  return worker;
}
