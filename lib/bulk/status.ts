export type BulkDisplayStatus = "DRAFT" | "READY" | "APPROVED" | "QUEUED" | "SENDING" | "SENT" | "FAILED" | "REJECTED" | "INVALID";

export interface BulkStatusInput {
  status: string;
  approvalStatus: string;
  hasEmail: boolean;
  hasDraft: boolean;
  /** A problem that blocks approval (unfilled placeholder, unapproved website email, ...). */
  blocked: boolean;
}

/** One status per row for the review table and results. */
export function bulkRowStatus(r: BulkStatusInput): BulkDisplayStatus {
  if (r.status === "SENT") return "SENT";
  if (r.status === "SENDING") return "SENDING";
  if (r.status === "SCHEDULED") return "QUEUED";
  if (r.approvalStatus === "REJECTED") return "REJECTED";
  if (r.status === "FAILED") return r.hasDraft ? "FAILED" : "INVALID";
  if (r.status === "NEW" || r.status === "GENERATING" || !r.hasDraft) return "DRAFT";
  if (!r.hasEmail || r.blocked) return "INVALID";
  return r.approvalStatus === "APPROVED" ? "APPROVED" : "READY";
}
