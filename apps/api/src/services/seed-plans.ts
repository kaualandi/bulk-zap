import { eq } from "drizzle-orm";
import { plans } from "@bulk-zap/db";
import type { NewPlan } from "@bulk-zap/db";
import { db } from "../db.js";
import { logger } from "../logger.js";

// Default billing plans. Idempotent by slug — safe to call on every boot.
const DEFAULT_PLANS: NewPlan[] = [
  {
    name: "Starter",
    slug: "starter",
    monthlyPriceCents: 9900, // R$99,00
    includedDispatches: 5000,
    overagePackageSize: 1000,
    overagePackagePriceCents: 2500, // R$25,00 / 1.000 disparos
    active: true,
  },
  {
    name: "Pro",
    slug: "pro",
    monthlyPriceCents: 29900, // R$299,00
    includedDispatches: 25000,
    overagePackageSize: 1000,
    overagePackagePriceCents: 2000, // R$20,00 / 1.000 disparos
    active: true,
  },
  {
    name: "Scale",
    slug: "scale",
    monthlyPriceCents: 79900, // R$799,00
    includedDispatches: 100000,
    overagePackageSize: 1000,
    overagePackagePriceCents: 1500, // R$15,00 / 1.000 disparos
    active: true,
  },
];

export async function seedPlans(): Promise<void> {
  for (const plan of DEFAULT_PLANS) {
    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.slug, plan.slug))
      .limit(1);

    if (existing) {
      await db
        .update(plans)
        .set({
          name: plan.name,
          monthlyPriceCents: plan.monthlyPriceCents,
          includedDispatches: plan.includedDispatches,
          overagePackageSize: plan.overagePackageSize,
          overagePackagePriceCents: plan.overagePackagePriceCents,
          active: plan.active,
        })
        .where(eq(plans.id, existing.id));
    } else {
      await db.insert(plans).values(plan);
    }
  }
  logger.info({ count: DEFAULT_PLANS.length }, "billing plans seeded");
}
