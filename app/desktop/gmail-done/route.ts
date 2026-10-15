import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Desktop app only: shown in the system browser when Google sign-in finishes. */
export function GET(req: NextRequest) {
  if (!env().desktopMode) return new NextResponse("Not found", { status: 404 });
  const ok = req.nextUrl.searchParams.get("oauth") === "connected";
  const message = req.nextUrl.searchParams.get("message") ?? "Could not connect Gmail.";
  const title = ok ? "Gmail connected" : "Gmail not connected";
  const text = ok ? "Sorts can now send from this Gmail account. You can close this tab and return to the Sorts app." : `${escapeHtml(message)} Return to Sorts and try again.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} · Sorts</title><link rel="icon" href="/icon.svg">
<style>body{font-family:"Segoe UI",system-ui,sans-serif;background:#070a10;color:#f5f7fb;display:grid;place-items:center;height:100vh;margin:0;
background-image:radial-gradient(60% 70% at 0% 100%,rgba(123,47,242,.2),transparent 70%),radial-gradient(55% 60% at 100% 0%,rgba(34,181,230,.13),transparent 70%)}
main{max-width:420px;text-align:center}img{width:48px;height:48px;margin-bottom:12px}
h1{font-size:22px;font-weight:600;letter-spacing:-.02em;color:${ok ? "#34d399" : "#f87171"}}p{color:#9aa6b8;line-height:1.55}</style></head>
<body><main><img src="/brand/sorts-mark.svg" alt="Sorts"><h1>${title}</h1><p>${text}</p></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
