import {
  UnsupportedOperationError,
  type DriverEvent,
  type DriverListener,
  type GroupSummary,
  type WhatsAppDriver,
} from "./whatsapp-driver.js";

const GRAPH_API = "https://graph.facebook.com/v22.0";

type CloudApiConfig = {
  phoneNumberId: string;
  token: string;
};

export class CloudApiDriver implements WhatsAppDriver {
  readonly accountId: string;
  private config: CloudApiConfig;
  private listeners = new Set<DriverListener>();

  constructor(accountId: string, config: CloudApiConfig) {
    this.accountId = accountId;
    this.config = config;
  }

  on(listener: DriverListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DriverEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  async connect(): Promise<void> {
    this.emit({ type: "connected" });
  }

  async disconnect(): Promise<void> {
    this.emit({ type: "disconnected" });
  }

  async logout(): Promise<void> {
    this.emit({ type: "disconnected", reason: "logout" });
  }

  async sendText(to: string, text: string) {
    const phone = to.replace(/@s\.whatsapp\.net$/, "").replace(/\D/g, "");
    const res = await fetch(
      `${GRAPH_API}/${this.config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`cloud_api_error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { messageId: data.messages?.[0]?.id ?? "" };
  }

  async deleteMessage(): Promise<void> {
    throw new UnsupportedOperationError("cloud_api", "deleteMessage");
  }

  async listGroups(): Promise<GroupSummary[]> {
    throw new UnsupportedOperationError("cloud_api", "listGroups");
  }

  async isMemberOfGroup(): Promise<boolean> {
    throw new UnsupportedOperationError("cloud_api", "isMemberOfGroup");
  }
}
