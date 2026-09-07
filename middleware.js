import { NextResponse } from "next/server";

// Simple password protection for /dashboard — the browser shows a login
// popup. Not meant for highly sensitive data, just to keep it off Google
// and stop randoms from opening the link.
export function middleware(request) {
  const auth = request.headers.get("authorization");

  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (user === process.env.DASHBOARD_USER && pass === process.env.DASHBOARD_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dashboard"' },
  });
}

export const config = {
  matcher: "/dashboard",
};
