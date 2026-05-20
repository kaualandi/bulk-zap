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
      logger: logger.child({ component: "baileys", accountId: this.accountId }) as never,
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

    this.sock.ev.on("groups.upsert", () => {
      this.refreshGroups().catch((err) =>
        logger.error({ err }, "failed to refresh groups on upsert")
      );
    });

    this.sock.ev.on("groups.update", () => {
      this.refreshGroups().catch((err) =>
        logger.error({ err }, "failed to refresh groups on update")
      );
    });

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

      if (statusCode && BAN_STATUS_CODES.has(statusCode)) {
        this.emit({ type: "banned", reason, statusCode });
        this.shouldReconnect = false;
        return;
      }

      this.emit({ type: "disconnected", reason, statusCode });

      if (this.shouldReconnect) {
        setTimeout(() => {
          this.connect().catch((err) =>
            logger.error({ err }, "reconnect failed")
          );
        }, 3000);
      }
    }
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
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }

  async logout(): Promise<void> {
    this.shouldReconnect = false;
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
