type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "marketing";

function makeLabel<T extends string>(map: Record<T, string>) {
  return (value: string | null | undefined): string =>
    value && value in map ? map[value as T] : (value ?? "");
}

function makeTone<T extends string>(
  map: Record<T, Tone>,
  fallback: Tone = "neutral"
) {
  return (value: string | null | undefined): Tone =>
    value && value in map ? map[value as T] : fallback;
}

export const campaignStatusLabel = makeLabel({
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
  failed: "Falhou",
  canceled: "Cancelada",
});

export const campaignStatusTone = makeTone<
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "canceled"
>({
  draft: "neutral",
  scheduled: "info",
  running: "warning",
  paused: "neutral",
  completed: "success",
  failed: "danger",
  canceled: "neutral",
});

export const campaignCategoryLabel = makeLabel({
  marketing: "Marketing",
  transacional: "Transacional",
  atendimento: "Atendimento",
  outros: "Outros",
});

export const campaignCategoryTone = makeTone<
  "marketing" | "transacional" | "atendimento" | "outros"
>({
  marketing: "marketing",
  transacional: "info",
  atendimento: "success",
  outros: "neutral",
});

export const accountStatusLabel = makeLabel({
  disconnected: "Desconectado",
  connecting: "Conectando",
  connected: "Conectado",
  banned: "Banido",
});

export const accountStatusTone = makeTone<
  "disconnected" | "connecting" | "connected" | "banned"
>({
  disconnected: "neutral",
  connecting: "warning",
  connected: "success",
  banned: "danger",
});

export const driverLabel = makeLabel({
  baileys: "Baileys",
  cloud_api: "Cloud API",
});

export const warmupModeLabel = makeLabel({
  off: "Desligado",
  auto: "Automático",
  manual: "Manual",
});

export const contactSourceLabel = makeLabel({
  whatsapp_sync: "Sincronia WhatsApp",
  csv_import: "Importação CSV",
  manual: "Manual",
});

export const blocklistSourceLabel = makeLabel({
  auto_opt_out: "Opt-out automático",
  manual: "Manual",
  imported: "Importado",
});

export const messageStatusLabel = makeLabel({
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  canceled: "Cancelada",
});

export const messageStatusTone = makeTone<
  "queued" | "sent" | "delivered" | "read" | "failed" | "canceled"
>({
  queued: "neutral",
  sent: "info",
  delivered: "success",
  read: "success",
  failed: "danger",
  canceled: "neutral",
});

export const INBOUND_CLASSIFICATIONS = {
  opt_out: "Opt-out",
  interesse: "Interesse",
  duvida: "Dúvida",
  reclamacao: "Reclamação",
  outro: "Outro",
} as const;

export const inboundClassificationLabel = makeLabel(INBOUND_CLASSIFICATIONS);

export const inboundClassificationTone = makeTone<
  "opt_out" | "interesse" | "duvida" | "reclamacao" | "outro"
>({
  opt_out: "danger",
  interesse: "success",
  duvida: "info",
  reclamacao: "warning",
  outro: "neutral",
});

export const listTypeLabel = makeLabel({
  contacts: "Contatos",
  groups: "Grupos",
});
