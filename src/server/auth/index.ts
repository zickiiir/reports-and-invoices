import NextAuth from "next-auth";
import { cache } from "react";

import { authConfig, requestOrigin, resolveSameOriginRedirect } from "./config";

const { auth: uncachedAuth, signIn, signOut } = NextAuth(authConfig);

// The /api/auth route handlers (the only place the redirect callback matters for the
// client-side signIn/signOut) get a lazily-built config, so the redirect callback can
// see the request — see `resolveSameOriginRedirect` for why Auth.js's own `baseUrl`
// can't be used. Not for `auth` above: with a lazy config, `auth(handler)` returns a
// Promise instead of a function, which proxy.ts can't export.
const { handlers } = NextAuth((req) => {
  const origin = req ? requestOrigin(req.headers) : null;
  return {
    ...authConfig,
    callbacks: {
      ...authConfig.callbacks,
      redirect: ({ url, baseUrl }) =>
        resolveSameOriginRedirect(url, origin ?? baseUrl),
    },
  };
});

// Cache only for use in RSC (dedupes multiple `auth()` calls within one request).
// `uncachedAuth` must be used in proxy.ts (middleware) — React's `cache()` relies
// on a per-request context that middleware doesn't have, so it could return a
// stale result from a previous request (observed as a login/redirect loop).
const auth = cache(uncachedAuth);

export { auth, uncachedAuth, handlers, signIn, signOut };
