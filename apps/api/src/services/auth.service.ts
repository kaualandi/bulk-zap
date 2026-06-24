import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import {
  organizations,
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
} from "@bulk-zap/db";
import { db } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

// --- Resend client (same pattern as email-alert.service.ts) ---
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

async function sendAuthEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const c = getResend();
  if (!c) {
    // Failsafe: never throw if Resend is not configured (mirrors email-alert.service.ts).
    logger.warn(
      { to: input.to, subject: input.subject },
      "auth email skipped: Resend not configured"
    );
    return;
  }
  try {
    await c.emails.send({
      from: env.AUTH_EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
  } catch (err) {
    logger.error({ err, to: input.to }, "failed to send auth email");
  }
}

// --- pt-BR email templates ---
function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">${title}</h1>
        ${body}
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
        <p style="margin:0;font-size:12px;color:#a1a1aa;">
          Você está recebendo este e-mail porque uma conta no BulkZap foi criada
          com este endereço. Se não foi você, ignore esta mensagem.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${label}</a>
  </p>
  <p style="margin:0;font-size:13px;color:#52525b;">Ou copie e cole este link no navegador:</p>
  <p style="margin:8px 0 0;font-size:13px;word-break:break-all;"><a href="${url}" style="color:#16a34a;">${url}</a></p>`;
}

// --- slug helpers (uniquified against organizations.slug) ---
function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "org";
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  // Extremely unlikely fallback.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Ensure an organization exists for a given user. Returns the org id.
 * Idempotent: if the user already owns an org, returns the existing one.
 */
export async function ensureOrgForUser(input: {
  userId: string;
  name?: string | null;
  email: string;
}): Promise<string> {
  const owned = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerUserId, input.userId))
    .limit(1);
  if (owned.length > 0) return owned[0].id;

  const displayName =
    (input.name && input.name.trim()) || input.email.split("@")[0] || "Minha organização";
  const slug = await uniqueSlug(slugify(displayName));

  const [org] = await db
    .insert(organizations)
    .values({
      name: displayName,
      slug,
      ownerUserId: input.userId,
    })
    .returning({ id: organizations.id });

  logger.info({ userId: input.userId, orgId: org.id }, "organization created for new user");
  return org.id;
}

/**
 * Resolve the org id a user belongs to (owner model — one org per user).
 * Falls back to creating one if somehow missing.
 */
export async function resolveOrgIdForUser(input: {
  userId: string;
  name?: string | null;
  email: string;
}): Promise<string> {
  return ensureOrgForUser(input);
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  // Allow the web origin(s) + the auth base URL so cross-origin cookie auth works.
  trustedOrigins: Array.from(
    new Set([env.APP_URL, env.BETTER_AUTH_URL, ...env.CORS_ORIGINS])
  ),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Redefinir sua senha — BulkZap",
        html: shell(
          "Redefinir senha",
          `<p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.6;">
             Recebemos um pedido para redefinir a senha da sua conta BulkZap.
             Clique no botão abaixo para escolher uma nova senha. O link expira em breve.
           </p>${button(url, "Redefinir senha")}`
        ),
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Confirme seu e-mail — BulkZap",
        html: shell(
          "Confirme seu e-mail",
          `<p style="margin:0;font-size:14px;color:#3f3f46;line-height:1.6;">
             Bem-vindo ao BulkZap! Confirme seu endereço de e-mail para ativar
             sua conta e começar a disparar.
           </p>${button(url, "Confirmar e-mail")}`
        ),
      });
    },
  },
  databaseHooks: {
    user: {
      create: {
        // After the user row is committed, provision their organization.
        after: async (createdUser) => {
          try {
            await ensureOrgForUser({
              userId: createdUser.id,
              name: createdUser.name,
              email: createdUser.email,
            });
          } catch (err) {
            logger.error(
              { err, userId: createdUser.id },
              "failed to provision organization on signup"
            );
          }
        },
      },
    },
    session: {
      create: {
        // Before the session is persisted, stamp it with the user's active org.
        before: async (newSession) => {
          try {
            const [u] = await db
              .select({ name: userTable.name, email: userTable.email })
              .from(userTable)
              .where(eq(userTable.id, newSession.userId))
              .limit(1);
            const orgId = await resolveOrgIdForUser({
              userId: newSession.userId,
              name: u?.name,
              email: u?.email ?? "",
            });
            return {
              data: {
                ...newSession,
                activeOrganizationId: orgId,
              },
            };
          } catch (err) {
            logger.error(
              { err, userId: newSession.userId },
              "failed to set activeOrganizationId on session"
            );
            return { data: newSession };
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
