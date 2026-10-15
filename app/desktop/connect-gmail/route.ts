import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/** Desktop app only: the system browser lands here (after token auto-login) to start Google sign-in. */
export function GET() {
  const { desktopMode, APP_URL } = env();
  if (!desktopMode) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(`${APP_URL}/api/oauth/google/start`);
}
