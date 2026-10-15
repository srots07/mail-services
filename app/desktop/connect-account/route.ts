import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/** The desktop window intercepts this link to open its Connect account dialog; anywhere else, go to the website. */
export function GET() {
  const portal = (process.env.PORTAL_URL ?? "").replace(/\/+$/, "");
  return NextResponse.redirect(portal ? `${portal}/account` : `${env().APP_URL}/`);
}
