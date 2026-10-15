import { AppShell } from "@/components/dashboard/app-shell";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/database/prisma";
import { env } from "@/lib/env";
import { getProviderSettings } from "@/lib/services/providers";
import { APP_VERSION } from "@/lib/version";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [settings, campaigns, attention] = await Promise.all([
    getProviderSettings(user.id),
    db().campaign.findMany({ where: { userId: user.id, kind: "BULK" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, campaignName: true } }),
    // Same rule as needsAttention() in lib/campaign-status.ts.
    db().campaign.count({
      where: { userId: user.id, kind: "BULK", OR: [{ status: { in: ["READY_FOR_REVIEW", "PAUSED", "FAILED"] } }, { failedCount: { gt: 0 } }] },
    }),
  ]);
  const mockMode = settings.ai === "mock" || settings.email === "mock";
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      mockMode={mockMode}
      autoLogin={env().autoLogin}
      providers={{ ai: settings.ai, email: settings.email }}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.campaignName }))}
      attention={attention}
      version={APP_VERSION}
    >
      {children}
    </AppShell>
  );
}
