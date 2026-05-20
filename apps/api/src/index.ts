import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { accountsRoutes } from "./routes/accounts.js";
import { contactsRoutes } from "./routes/contacts.js";
import { groupsRoutes } from "./routes/groups.js";
import { templatesRoutes } from "./routes/templates.js";
import { listsRoutes } from "./routes/lists.js";
import { campaignsRoutes } from "./routes/campaigns.js";
import { reportsRoutes } from "./routes/reports.js";
import { emailSubscriptionsRoutes } from "./routes/email-subscriptions.js";
import { aiRoutes } from "./routes/ai.js";
import { inboundRoutes } from "./routes/inbound.js";
import { startClassifyInboundWorker } from "./jobs/classify-inbound.job.js";
import { startBullBoard } from "./admin/bull-board.js";
import { bootAllConnected } from "./services/account-manager.service.js";
import { startSendMessageWorker } from "./jobs/send-message.job.js";
import { startWarmupCheckWorker } from "./jobs/warmup-check.job.js";

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGINS }))
  .get("/health", () => ({ ok: true }))
  .use(accountsRoutes)
  .use(contactsRoutes)
  .use(groupsRoutes)
  .use(templatesRoutes)
  .use(listsRoutes)
  .use(campaignsRoutes)
  .use(reportsRoutes)
  .use(emailSubscriptionsRoutes)
  .use(aiRoutes)
  .use(inboundRoutes)
  .listen({ hostname: env.API_HOST, port: env.API_PORT });

logger.info(
  `🦊 BulkZap API listening on http://${env.API_HOST}:${env.API_PORT}`
);

startSendMessageWorker();
startWarmupCheckWorker();
startClassifyInboundWorker();
startBullBoard();

bootAllConnected().catch((err) =>
  logger.error({ err }, "bootAllConnected failed")
);

export type App = typeof app;
