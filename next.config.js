/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Security folks flag this regularly — don't disclose what the app runs on.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app itself is never embedded anywhere — DENY is fine here. The PDF/report
          // endpoints below need a same-origin exception (see their own header block):
          // they're deliberately previewed in an in-app <iframe>, and DENY blocks that too.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Later header blocks override earlier ones for the same key on a matching path
        // (see Next.js docs on header overriding) — this narrows X-Frame-Options back to
        // SAMEORIGIN just for the routes `ReportPreviewModal` iframes, so the generic
        // DENY above still applies everywhere else.
        source: "/api/invoices/:id/pdf",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/api/timesheets/report",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default config;
