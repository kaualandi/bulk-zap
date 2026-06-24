function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const isProduction = (process.env.NODE_ENV ?? "development") === "production";

/**
 * Required in production, but tolerated in dev with an insecure fallback + a loud
 * warning. Use for secrets that MUST be set before going live (forgeable
 * sessions / unsigned webhooks otherwise) but shouldn't block local `bun run dev`.
 */
function requiredInProd(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required env var in production: ${name}`);
  }
  console.warn(
    `[env] ${name} não definido — usando fallback INSEGURO de dev. Nunca use em produção.`
  );
  return devFallback;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6379"),
  API_PORT: Number(optional("API_PORT", "3000")),
  API_HOST: optional("API_HOST", "0.0.0.0"),
  CORS_ORIGINS: optional("CORS_ORIGINS", "http://localhost:3001")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  ALERT_EMAIL_FROM: optional("ALERT_EMAIL_FROM", "alerts@example.com"),
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  BULL_BOARD_USER: process.env.BULL_BOARD_USER ?? "",
  BULL_BOARD_PASS: process.env.BULL_BOARD_PASS ?? "",

  // --- Better Auth ---
  // Signs sessions/tokens. Empty in prod => forgeable sessions, so fail fast there.
  BETTER_AUTH_SECRET: requiredInProd(
    "BETTER_AUTH_SECRET",
    "dev-insecure-better-auth-secret-change-me"
  ),
  BETTER_AUTH_URL: optional("BETTER_AUTH_URL", "http://localhost:3000"),
  AUTH_EMAIL_FROM: optional("AUTH_EMAIL_FROM", "auth@example.com"),
  APP_URL: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3001"),

  // --- Mercado Pago ---
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN ?? "",
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET ?? "",

  NODE_ENV: optional("NODE_ENV", "development"),
};
