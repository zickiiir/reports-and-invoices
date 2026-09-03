import { eq } from "drizzle-orm";
import { CredentialsSignin, type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "next-auth/jwt";
import { z } from "zod";

import { db } from "~/server/db";
import { users, type UserRole } from "~/server/db/schema";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

/** Custom code in the `error=CredentialsSignin&code=...` URL — the login page uses it
 * to distinguish this from "wrong email/password" and show a clearer message (see
 * src/app/login/page.tsx). */
class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
}

export type { UserRole };

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the
 * `session`/`jwt` objects and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      managerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    managerId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    managerId: string | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Options for NextAuth.js. Credentials-only (email + password, hash in the DB), JWT
 * session — no DB adapter or next-auth tables.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      authorize: async (rawCredentials, request) => {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        // Not just a "trust the client" header — the app runs without a reverse proxy
        // in front of it (see docker-compose.yml), so for a self-hosted deployment this
        // header either is missing (falls back to the shared "unknown" key) or comes
        // from a trusted layer the operator sets up themselves.
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

        // Two separate limits: email protects one specific account even against an
        // attack from many IPs, IP protects against password-spraying many accounts
        // from one source. Short window (15 min) — also resets on container restart
        // (see rate-limit.ts).
        const emailOk = checkRateLimit(`login:email:${email}`, 5, 15 * 60 * 1000);
        const ipOk = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
        if (!emailOk || !ipOk) throw new TooManyAttemptsError();

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        // Even without an existing user, run the password through bcrypt (against a
        // fixed dummy hash) — otherwise account existence could be inferred from
        // response timing (see the comment on DUMMY_PASSWORD_HASH).
        const passwordOk = await verifyPassword(
          parsed.data.password,
          user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        );
        if (!user || !passwordOk) return null;

        resetRateLimit(`login:email:${email}`);
        resetRateLimit(`login:ip:${ip}`);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          managerId: user.managerId,
        };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        // `authorize()` above always returns a valid id from the DB.
        token.id = user.id!;
        token.role = user.role;
        token.managerId = user.managerId;
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id,
        role: token.role,
        managerId: token.managerId,
      },
    }),
  },
} satisfies NextAuthConfig;
