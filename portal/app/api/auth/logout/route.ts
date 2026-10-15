import { NextResponse } from "next/server";
import { destroySession, sameOrigin } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  if (sameOrigin(request)) await destroySession();
  return NextResponse.redirect(new URL("/", env().APP_URL), 303);
}
