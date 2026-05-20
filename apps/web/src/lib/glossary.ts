export type GlossaryEntry = {
  title: string;
  description: string;
};

export const glossary: Record<string, GlossaryEntry> = {
  inbound: {
    title: "Inbound",
    description:
      "Mensagens que seus números recebem dos contatos (respostas, dúvidas, opt-outs). O oposto do disparo (outbound).",
  },

  warmup: {
    title: "Warmup (aquecimento)",
    description:
      "Aquecimento gradual de um número novo, enviando poucas mensagens nos primeiros dias e aumentando aos poucos. Reduz risco de ban porque imita uso humano.",
  },

  jitter: {
    title: "Jitter",
    description:
      "Intervalo aleatório entre o envio de cada mensagem (ex: 15–90s). Em vez de disparar tudo seguido (suspeito), o sistema espera um tempo aleatório entre cada envio, parecendo mais humano.",
  },

  pool: {
    title: "Pool de números",
    description:
      "Conjunto de números do WhatsApp que serão revezados durante o disparo. Distribuir o volume entre vários números reduz a chance de qualquer um cair.",
  },

  blocklist: {
    title: "Blocklist",
    description:
      "Lista de contatos que pediram para não receber mais mensagens. Eles são automaticamente excluídos de todas as campanhas futuras.",
  },

  optOut: {
    title: "Opt-out",
    description:
      'Quando uma pessoa pede para sair (ex: responde "para", "stop", "não envie mais"). A IA detecta isso e adiciona o contato à blocklist automaticamente.',
  },

  driver: {
    title: "Driver",
    description:
      "Mecanismo técnico que conecta seu número ao WhatsApp. Pode ser Baileys (não-oficial, via QR Code, suporta grupos) ou Cloud API (oficial da Meta, apenas DMs).",
  },

  baileys: {
    title: "Baileys",
    description:
      "Driver não-oficial que se conecta como WhatsApp Web (via QR Code). É o único que suporta envio em grupos, mas tem risco de ban.",
  },

  cloudApi: {
    title: "Cloud API",
    description:
      "API oficial da Meta. Não tem ban tradicional, mas só envia mensagens 1-a-1 (não em grupos) e exige templates pré-aprovados.",
  },

  jid: {
    title: "JID",
    description:
      'Identificador único de contato ou grupo no WhatsApp. Ex: "5511999999999@s.whatsapp.net" (contato) ou "120363xxxxx@g.us" (grupo).',
  },

  poolGroupValidation: {
    title: "Validação pool × grupo",
    description:
      "Antes de iniciar um disparo em grupos, o sistema verifica se TODOS os números do pool são membros de TODOS os grupos da lista. Se algum não for, bloqueia a campanha.",
  },

  lgpd: {
    title: "LGPD",
    description:
      "Lei Geral de Proteção de Dados. Para enviar marketing por WhatsApp você precisa ter base legal (consentimento ou interesse legítimo). O checkbox de consent atesta isso.",
  },

  marketing: {
    title: "Categoria marketing",
    description:
      "Mensagens promocionais. É a categoria com maior risco de ban no WhatsApp porque os destinatários costumam reportar mais.",
  },

  confidence: {
    title: "Confidence (confiança)",
    description:
      'Quão certa a IA está da classificação, de 0% a 100%. A blocklist automática só age quando a confiança em "opt-out" é ≥70%.',
  },

  qrCode: {
    title: "QR Code",
    description:
      'Código que aparece ao conectar um número Baileys. Você escaneia pelo WhatsApp do celular ("Aparelhos conectados") para autenticar.',
  },

  dailyLimit: {
    title: "Limite diário",
    description:
      "Quantas mensagens este número pode enviar por dia. Vazio = sem limite. Útil para números em warmup ou que você quer proteger.",
  },

  status: {
    title: "Status do número",
    description:
      "Estado atual da conexão: 'connected' (pronto para enviar), 'connecting' (gerando QR), 'disconnected' (offline), 'banned' (foi pego pelo anti-spam do WhatsApp).",
  },

  run: {
    title: "Execução (run)",
    description:
      "Cada vez que uma campanha é disparada. Uma mesma campanha pode ter várias execuções (ex: agendamento recorrente).",
  },

  template: {
    title: "Template",
    description:
      'Texto pré-escrito da mensagem, com variáveis como {{nome}}. Na hora do envio, as variáveis são substituídas pelos dados do destinatário.',
  },

  source: {
    title: "Origem do contato",
    description:
      'De onde o contato veio: "whatsapp_sync" (sincronizado automaticamente pelo número conectado), "csv_import" (planilha que você importou) ou "manual" (criado manualmente).',
  },
};
