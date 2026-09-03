import NextAuth from "next-auth";
import { cache } from "react";

import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

// Cache only for use in RSC (dedupes multiple `auth()` calls within one request).
// `uncachedAuth` must be used in proxy.ts (middleware) — React's `cache()` relies
// on a per-request context that middleware doesn't have, so it could return a
// stale result from a previous request (observed as a login/redirect loop).
const auth = cache(uncachedAuth);

export { auth, uncachedAuth, handlers, signIn, signOut };
