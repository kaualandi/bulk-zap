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
import { billingRoutes } from "./routes/billing.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { startClassifyInboundWorker } from "./jobs/classify-inbound.job.js";
import { createBullBoardApp } from "./admin/bull-board.js";
import { bootAllConnected } from "./services/account-manager.service.js";
import { startSendMessageWorker } from "./jobs/send-message.job.js";
import { startWarmupCheckWorker } from "./jobs/warmup-check.job.js";
import { startAutoRechargeWorker } from "./jobs/auto-recharge.job.js";
import { auth } from "./services/auth.service.js";
import { seedPlans } from "./services/seed-plans.js";

const bullBoardApp = createBullBoardApp();

const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGINS, credentials: true }))
  .get("/health", () => ({ ok: true }))
  // Better Auth handler (public: handles sign-up/in/out, verify, reset, etc.).
  // .all forwarding preserves the /api/auth/* prefix Better Auth needs; do NOT
  // use app.mount() which strips the prefix.
  .all("/api/auth/*", ({ request }) => auth.handler(request))
  .all("/api/auth", ({ request }) => auth.handler(request))
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
  .use(billingRoutes)
  .use(onboardingRoutes);

if (bullBoardApp) {
  app.all("/admin/queues", ({ request }) => bullBoardApp.fetch(request));
  app.all("/admin/queues/*", ({ request }) => bullBoardApp.fetch(request));
}

app.listen({ hostname: env.API_HOST, port: env.API_PORT });

logger.info(
  `🦊 BulkZap API listening on http://${env.API_HOST}:${env.API_PORT}`
);

startSendMessageWorker();
startWarmupCheckWorker();
startClassifyInboundWorker();
startAutoRechargeWorker();

bootAllConnected().catch((err) =>
  logger.error({ err }, "bootAllConnected failed")
);

seedPlans().catch((err) => logger.error({ err }, "seedPlans failed"));

export type App = typeof app;
