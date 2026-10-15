"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BarSeries, type BarDatum } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/client/api";

interface SendPoint {
  kind: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

const HOUR = 3_600_000;

/** Sent vs failed over time for one campaign, bucketed by hour (short runs) or by day. */
export function SendTimeline({ campaignId, version }: { campaignId: string; version: number }) {
  const [items, setItems] = useState<SendPoint[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ items: SendPoint[] }>(`/api/campaigns/${campaignId}/logs?type=sends&limit=300`)
      .then((r) => !cancelled && setItems(r.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [campaignId, version]);

  const { data, unit } = useMemo(() => bucket(items ?? []), [items]);

  if (failed) return null;
  return (
    <Card variant="chart">
      <CardHeader title="Sending over time" description={items && items.length >= 300 ? "Based on the 300 most recent send attempts." : `Send attempts per ${unit}.`} />
      <CardBody>
        {items === null ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (
          <BarSeries
            label={`Emails sent and failed per ${unit}`}
            data={data}
            series={[
              { name: "Sent", color: "var(--success)" },
              { name: "Failed", color: "var(--danger)" },
            ]}
            empty="No emails have been sent for this campaign yet."
          />
        )}
      </CardBody>
    </Card>
  );
}

function bucket(items: SendPoint[]): { data: BarDatum[]; unit: "hour" | "day" } {
  const points = items
    .filter((s) => s.kind === "CAMPAIGN" && (s.status === "SENT" || s.status === "FAILED"))
    .map((s) => ({ t: new Date(s.sentAt ?? s.createdAt).getTime(), failed: s.status === "FAILED" }));
  if (!points.length) return { data: [], unit: "day" };
  const min = Math.min(...points.map((p) => p.t));
  const max = Math.max(...points.map((p) => p.t));
  const unit = max - min <= 36 * HOUR ? "hour" : "day";
  const size = unit === "hour" ? HOUR : 24 * HOUR;
  const MIN_BUCKETS = 8;
  const first = new Date(min);
  if (unit === "hour") first.setMinutes(0, 0, 0);
  else first.setHours(0, 0, 0, 0);
  const span = Math.floor((max - first.getTime()) / size) + 1;
  // Short runs get leading empty buckets so a single busy hour reads as a bar, not a block.
  const start = new Date(first.getTime() - Math.max(0, MIN_BUCKETS - span) * size);
  const count = Math.min(60, Math.max(span, MIN_BUCKETS));
  const multiDay = new Date(start).toDateString() !== new Date(max).toDateString();
  const data: BarDatum[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * size);
    return {
      label:
        unit === "day"
          ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : d.toLocaleString(undefined, multiDay ? { month: "short", day: "numeric", hour: "numeric" } : { hour: "numeric" }),
      values: [0, 0],
    };
  });
  for (const p of points) {
    const i = Math.min(count - 1, Math.floor((p.t - start.getTime()) / size));
    data[i].values[p.failed ? 1 : 0]++;
  }
  return { data, unit };
}
