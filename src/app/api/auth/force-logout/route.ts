import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Session cookie points to a valid JWT, but the user no longer exists in the DB
 * (deleted account, or a dev/database reset) — `(app)/layout.tsx` redirects here
 * instead of crashing with an unhandled error. Clears auth cookies and sends the
 * user to /login.
 */
export async function GET(req: Request) {
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.includes("authjs") || c.name.includes("next-auth")) {
      store.delete(c.name);
    }
  }
  return NextResponse.redirect(new URL("/login", req.url));
}
