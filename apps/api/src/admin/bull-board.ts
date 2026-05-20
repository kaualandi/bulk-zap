import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express from "express";
import basicAuth from "express-basic-auth";
import { env } from "../env.js";
import { logger } from "../logger.js";
import {
  classifyInboundQueue,
  sendMessageQueue,
  warmupCheckQueue,
} from "../jobs/queue.js";

export function startBullBoard(): void {
  if (!env.BULL_BOARD_USER || !env.BULL_BOARD_PASS) {
    logger.warn(
      "Bull Board disabled: defina BULL_BOARD_USER e BULL_BOARD_PASS no .env"
    );
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: [
      new BullMQAdapter(sendMessageQueue),
      new BullMQAdapter(warmupCheckQueue),
      new BullMQAdapter(classifyInboundQueue),
    ],
    serverAdapter,
  });

  const app = express();
  app.use(
    "/admin/queues",
    basicAuth({
      users: { [env.BULL_BOARD_USER]: env.BULL_BOARD_PASS },
      challenge: true,
      realm: "BulkZap Bull Board",
    }),
    serverAdapter.getRouter()
  );

  app.get("/", (_req, res) => {
    res.redirect("/admin/queues");
  });

  app.listen(env.BULL_BOARD_PORT, () => {
    logger.info(
      `📊 Bull Board em http://localhost:${env.BULL_BOARD_PORT}/admin/queues`
    );
  });
}
