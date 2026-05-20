function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
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
  NODE_ENV: optional("NODE_ENV", "development"),
};
