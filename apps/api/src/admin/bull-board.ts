import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { serveStatic } from "hono/bun";
import { trimTrailingSlash } from "hono/trailing-slash";
import { env } from "../env.js";
import { logger } from "../logger.js";
import {
  autoRechargeQueue,
  classifyInboundQueue,
  sendMessageQueue,
  warmupCheckQueue,
} from "../jobs/queue.js";

const BASE_PATH = "/admin/queues";

export type BullBoardApp = Hono | null;

export function createBullBoardApp(): BullBoardApp {
  if (!env.BULL_BOARD_USER || !env.BULL_BOARD_PASS) {
    logger.warn(
      "Bull Board desativado: defina BULL_BOARD_USER e BULL_BOARD_PASS no .env"
    );
    return null;
  }

  const serverAdapter = new HonoAdapter(serveStatic);
  serverAdapter.setBasePath(BASE_PATH);

  createBullBoard({
    queues: [
      new BullMQAdapter(sendMessageQueue),
      new BullMQAdapter(warmupCheckQueue),
      new BullMQAdapter(classifyInboundQueue),
      new BullMQAdapter(autoRechargeQueue),
    ],
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: "BulkZap — Filas",
        locale: { lng: "pt-BR" },
      },
    },
  });

  const inner = serverAdapter.registerPlugin();

  // Wrapper: aplica basic auth + monta o inner Hono no path completo,
  // assim ele recebe a URL com `/admin/queues/...` e o adapter consegue
  // resolver os assets estáticos corretamente.
  const app = new Hono();
  app.use(trimTrailingSlash());
  app.use(
    `${BASE_PATH}/*`,
    basicAuth({
      username: env.BULL_BOARD_USER,
      password: env.BULL_BOARD_PASS,
      realm: "BulkZap Bull Board",
    })
  );
  app.route(BASE_PATH, inner);

  logger.info(`📊 Bull Board montado em ${BASE_PATH}`);
  return app;
}
