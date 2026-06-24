import { Elysia } from "elysia";
import { authPlugin } from "../lib/auth-middleware.js";
import { getOnboardingStatus } from "../services/onboarding.service.js";

export const onboardingRoutes = new Elysia({ prefix: "/onboarding" })
  .use(authPlugin)
  .get(
    "/status",
    async ({ organizationId }) => await getOnboardingStatus(organizationId),
    { auth: true }
  );
