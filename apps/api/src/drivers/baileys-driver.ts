import {
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { logger } from "../logger.js";
import {
  usePostgresAuthState,
  clearAuthState,
} from "../services/session-store.service.js";
import {
  type WhatsAppDriver,
  type DriverEvent,
  type DriverListener,
  type GroupSummary,
} from "./whatsapp-driver.js";

const BAN_STATUS_CODES = new Set([401, 403, 440, 515]);

export class BaileysDriver implements WhatsAppDriver {
  readonly accountId: string;
  private sock: WASocket | null = null;
  private saveCreds: (() => Promise<void>) | null = null;
  private listeners = new Set<DriverListener>();
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshGroupsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  on(listener: DriverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DriverEvent): void {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        logger.error({ err, accountId: this.accountId }, "listener error");
      }
    });
  }

  async connect(): Promise<void> {
    const { state, saveCreds } = await usePostgresAuthState(this.accountId);
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      browser: ["BulkZap", "Chrome", "1.0.0"],
      shouldIgnoreJid: (jid) => {
        if (!jid) return false;
        return (
          jid.endsWith("@g.us") ||
          jid === "status@broadcast" ||
          jid.endsWith("@newsletter") ||
          jid.endsWith("@broadcast")
        );
      },
      logger: logger.child(
        { component: "baileys", accountId: this.accountId },
        { level: "warn" }
      ) as never,
    });

    this.sock.ev.on("creds.update", () => {
      saveCreds().catch((err) =>
        logger.error({ err }, "failed to save creds")
      );
    });

    this.sock.ev.on("connection.update", (update) =>
      this.handleConnectionUpdate(update)
    );

    this.sock.ev.on("messages.upsert", ({ messages: incoming, type }) => {
      if (type !== "notify") return;
      for (const msg of incoming) {
        if (msg.key.fromMe) continue;
        const fromJid = msg.key.remoteJid;
        if (!fromJid) continue;
        if (fromJid.endsWith("@g.us")) continue;
        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          "";
        if (!text.trim()) continue;
        this.emit({ type: "inbound-message", fromJid, text });
      }
    });

    this.sock.ev.on("contacts.upsert", (contacts) => {
      this.emit({
        type: "contacts-updated",
        contacts: contacts.map((c) => ({
          jid: c.id,
          name: c.name ?? null,
          pushName: c.notify ?? null,
        })),
      });
    });

    this.sock.ev.on("groups.upsert", () => this.scheduleRefreshGroups());
    this.sock.ev.on("groups.update", () => this.scheduleRefreshGroups());

    this.emit({ type: "connecting" });
  }

  private async handleConnectionUpdate(
    update: Partial<ConnectionState>
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.emit({ type: "qr", qr });
    }

    if (connection === "open") {
      this.reconnectAttempts = 0;
      this.emit({ type: "connected" });
      this.refreshGroups().catch((err) =>
        logger.error({ err }, "initial groups refresh failed")
      );
      return;
    }

    if (connection === "close") {
      const boom = lastDisconnect?.error as Boom | undefined;
      const statusCode = boom?.output?.statusCode;
      const reason = boom?.message ?? "unknown";

      if (statusCode === DisconnectReason.loggedOut) {
        await clearAuthState(this.accountId);
        this.emit({ type: "banned", reason: "logged_out" });
        this.shouldReconnect = false;
        return;
      }

      if (statusCode === DisconnectReason.connectionReplaced) {
        this.emit({ type: "banned", reason: "connection_replaced", statusCode });
        this.shouldReconnect = false;
        return;
      }

      if (statusCode && BAN_STATUS_CODES.has(statusCode)) {
        this.emit({ type: "banned", reason, statusCode });
        this.shouldReconnect = false;
        return;
      }

      this.emit({ type: "disconnected", reason, statusCode });

      if (this.shouldReconnect) {
        const delay = Math.min(
          3000 * 2 ** this.reconnectAttempts,
          60_000
        );
        this.reconnectAttempts += 1;
        logger.info(
          { accountId: this.accountId, attempt: this.reconnectAttempts, delay, statusCode, reason },
          "reconnecting baileys"
        );
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect().catch((err) =>
            logger.error({ err, accountId: this.accountId }, "reconnect failed")
          );
        }, delay);
      }
    }
  }

  private scheduleRefreshGroups(): void {
    if (this.refreshGroupsTimer) return;
    this.refreshGroupsTimer = setTimeout(() => {
      this.refreshGroupsTimer = null;
      this.refreshGroups().catch((err) =>
        logger.error({ err, accountId: this.accountId }, "scheduled refreshGroups failed")
      );
    }, 5000);
  }

  private async refreshGroups(): Promise<void> {
    if (!this.sock) return;
    const groups = await this.sock.groupFetchAllParticipating();
    const summary: GroupSummary[] = Object.values(groups).map((g) => ({
      jid: g.id,
      subject: g.subject,
      participantsCount: g.participants.length,
    }));
    this.emit({ type: "groups-updated", groups: summary });
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.refreshGroupsTimer) {
      clearTimeout(this.refreshGroupsTimer);
      this.refreshGroupsTimer = null;
    }
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }

  async logout(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.refreshGroupsTimer) {
      clearTimeout(this.refreshGroupsTimer);
      this.refreshGroupsTimer = null;
    }
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        logger.warn({ err }, "logout error");
      }
      this.sock = null;
    }
    await clearAuthState(this.accountId);
  }

  async sendText(to: string, text: string) {
    if (!this.sock) throw new Error("driver not connected");
    const result = await this.sock.sendMessage(to, { text });
    return { messageId: result?.key.id ?? "" };
  }

  async deleteMessage(to: string, providerMsgId: string): Promise<void> {
    if (!this.sock) throw new Error("driver not connected");
    await this.sock.sendMessage(to, {
      delete: { remoteJid: to, fromMe: true, id: providerMsgId },
    });
  }

  async listGroups(): Promise<GroupSummary[]> {
    if (!this.sock) throw new Error("driver not connected");
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      jid: g.id,
      subject: g.subject,
      participantsCount: g.participants.length,
    }));
  }

  async isMemberOfGroup(jid: string): Promise<boolean> {
    if (!this.sock) throw new Error("driver not connected");
    try {
      const meta = await this.sock.groupMetadata(jid);
      const me = this.sock.user?.id;
      if (!me) return false;
      return meta.participants.some((p) => p.id === me);
    } catch {
      return false;
    }
  }
}
