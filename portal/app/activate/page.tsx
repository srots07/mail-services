import { requireUser } from "@/lib/auth";
import { normaliseUserCode } from "@/lib/crypto";
import { ActivateForm } from "./form";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = normaliseUserCode((await searchParams).code ?? "");
  const user = await requireUser(`/activate${code ? `?code=${encodeURIComponent(code)}` : ""}`);
  return (
    <div className="card narrow featured cut">
      <span className="eyebrow">Sorts for Windows</span>
      <h2 style={{ marginTop: 10 }}>Connect your PC</h2>
      <p className="muted small">
        Signed in as <b>{user.email}</b>. Check that the code below matches the one shown in Sorts, then click Connect this PC.
      </p>
      <ActivateForm initialCode={code} />
    </div>
  );
}
