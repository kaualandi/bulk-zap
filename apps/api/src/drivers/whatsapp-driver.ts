export type GroupSummary = {
  jid: string;
  subject: string;
  participantsCount: number;
};

export type ContactSummary = {
  jid: string;
  name?: string | null;
  pushName?: string | null;
};

export type SendResult = { messageId: string };

export type DriverEvent =
  | { type: "qr"; qr: string }
  | { type: "connecting" }
  | { type: "connected" }
  | { type: "disconnected"; reason?: string; statusCode?: number }
  | { type: "banned"; reason?: string; statusCode?: number }
  | { type: "contacts-updated"; contacts: ContactSummary[] }
  | { type: "groups-updated"; groups: GroupSummary[] }
  | { type: "inbound-message"; fromJid: string; text: string };

export type DriverListener = (event: DriverEvent) => void;

export interface WhatsAppDriver {
  readonly accountId: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;

  sendText(to: string, text: string): Promise<SendResult>;

  listGroups(): Promise<GroupSummary[]>;
  isMemberOfGroup(jid: string): Promise<boolean>;

  on(listener: DriverListener): () => void;
}

export class UnsupportedOperationError extends Error {
  constructor(driver: string, op: string) {
    super(`Driver "${driver}" does not support operation "${op}"`);
  }
}
