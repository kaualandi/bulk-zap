import { Queue, Worker, type Job } from "bullmq";
import { createBullConnection } from "../redis.js";

export const QUEUE_NAMES = {
  sendMessage: "send-message",
  warmupCheck: "warmup-check",
  classifyInbound: "classify-inbound",
} as const;

export type SendMessageJobData = {
  campaignRunId: string;
  messageId: string;
};

export type WarmupCheckJobData = Record<string, never>;

export type ClassifyInboundJobData = {
  inboundMessageId: string;
};

export const sendMessageQueue = new Queue<SendMessageJobData>(
  QUEUE_NAMES.sendMessage,
  { connection: createBullConnection() }
);

export const warmupCheckQueue = new Queue<WarmupCheckJobData>(
  QUEUE_NAMES.warmupCheck,
  { connection: createBullConnection() }
);

export const classifyInboundQueue = new Queue<ClassifyInboundJobData>(
  QUEUE_NAMES.classifyInbound,
  { connection: createBullConnection() }
);

export function createSendMessageWorker(
  processor: (job: Job<SendMessageJobData>) => Promise<void>
): Worker<SendMessageJobData> {
  return new Worker<SendMessageJobData>(QUEUE_NAMES.sendMessage, processor, {
    connection: createBullConnection(),
    concurrency: 1,
  });
}

export function createWarmupCheckWorker(
  processor: (job: Job<WarmupCheckJobData>) => Promise<void>
): Worker<WarmupCheckJobData> {
  return new Worker<WarmupCheckJobData>(QUEUE_NAMES.warmupCheck, processor, {
    connection: createBullConnection(),
    concurrency: 1,
  });
}

export function createClassifyInboundWorker(
  processor: (job: Job<ClassifyInboundJobData>) => Promise<void>
): Worker<ClassifyInboundJobData> {
  return new Worker<ClassifyInboundJobData>(
    QUEUE_NAMES.classifyInbound,
    processor,
    { connection: createBullConnection(), concurrency: 4 }
  );
}
