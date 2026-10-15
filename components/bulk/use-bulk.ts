"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { BulkOverview } from "@/lib/services/bulk";

const LIVE = new Set(["GENERATING", "SCHEDULED", "RUNNING"]);

export function isBulkLive(o: BulkOverview | null): boolean {
  return Boolean(o && (o.counts.queued > 0 || LIVE.has(o.campaign.status)));
}

/** Campaign overview, refreshed while generation or sending is running. */
export function useBulkOverview(campaignId: string) {
  const [overview, setOverview] = useState<BulkOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const o = await api<BulkOverview>(`/api/campaigns/${campaignId}/bulk`);
      setOverview(o);
      setError(null);
      setVersion((v) => v + 1);
      return o;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the campaign.");
      return null;
    }
  }, [campaignId]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const live = isBulkLive(overview);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [live, refresh]);

  return { overview, error, refresh, version };
}
