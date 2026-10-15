import { authedRoute, ok } from "@/lib/api/handler";
import { listBulkRows, type BulkRowFilter } from "@/lib/services/bulk";

type Params = { id: string };

const FILTERS: BulkRowFilter[] = ["all", "invalid", "ready", "approved", "rejected", "queued", "sent", "failed"];

export const GET = authedRoute<Params>({}, async ({ req, user, params }) => {
  const sp = new URL(req.url).searchParams;
  const filter = (FILTERS as string[]).includes(sp.get("filter") ?? "") ? (sp.get("filter") as BulkRowFilter) : "all";
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "50", 10) || 50));
  return ok(await listBulkRows(user.id, params.id, { filter, search: sp.get("search")?.slice(0, 200) ?? undefined, page, pageSize }));
});
