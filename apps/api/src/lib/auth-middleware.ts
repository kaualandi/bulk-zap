import { Elysia } from "elysia";
import { auth, resolveOrgIdForUser } from "../services/auth.service.js";

/**
 * Better Auth session/user shapes (re-derived from the runtime API return type).
 * Kept minimal & local so route handlers get a useful type without importing
 * Better Auth internals everywhere.
 */
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  activeOrganizationId?: string | null;
};

/**
 * Elysia plugin exposing an `auth` macro.
 *
 * Usage on a protected route group:
 *
 *   import { authPlugin } from "../lib/auth-middleware.js";
 *
 *   export const fooRoutes = new Elysia({ prefix: "/foo" })
 *     .use(authPlugin)
 *     .get("/", ({ user, organizationId }) => { ... }, { auth: true });
 *
 * When `auth: true` is set, the macro:
 *   - reads the session via auth.api.getSession({ headers })
 *   - returns 401 if there is no valid session
 *   - resolves the org id (session.activeOrganizationId, falling back to the
 *     user's owned org) and derives { user, session, organizationId } onto ctx.
 *
 * `noEmailVerificationCheck` is left implicit: Better Auth already enforces
 * requireEmailVerification at sign-in, so an unverified user never gets a session.
 */
export const authPlugin = new Elysia({ name: "auth-plugin" }).macro({
  auth: {
    async resolve({ request, status }) {
      const result = await auth.api.getSession({ headers: request.headers });
      if (!result || !result.session || !result.user) {
        return status(401, { error: "Não autenticado" });
      }

      const user = result.user as unknown as AuthUser;
      const session = result.session as unknown as AuthSession;

      const organizationId =
        session.activeOrganizationId ??
        (await resolveOrgIdForUser({
          userId: user.id,
          name: user.name,
          email: user.email,
        }));

      return { user, session, organizationId };
    },
  },
});

/**
 * Standalone helper for non-Elysia contexts (e.g. BullMQ jobs, scripts) that
 * have a Headers object and need the authenticated principal.
 * Returns null when unauthenticated.
 */
export async function getAuthContext(
  headers: Headers
): Promise<{ user: AuthUser; session: AuthSession; organizationId: string } | null> {
  const result = await auth.api.getSession({ headers });
  if (!result || !result.session || !result.user) return null;

  const user = result.user as unknown as AuthUser;
  const session = result.session as unknown as AuthSession;
  const organizationId =
    session.activeOrganizationId ??
    (await resolveOrgIdForUser({
      userId: user.id,
      name: user.name,
      email: user.email,
    }));

  return { user, session, organizationId };
}
