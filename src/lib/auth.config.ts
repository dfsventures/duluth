import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * Edge-compatible auth config — no Prisma or bcryptjs.
 * Used by middleware. The full auth.ts extends this with DB callbacks.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []),
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // authorize is intentionally empty here — only used in full auth.ts
      async authorize() { return null; },
    }),
  ],
  callbacks: {
    async jwt({ token }) {
      // token already has id/role/status set by the full auth.ts jwt callback
      return token;
    },
    async session({ session, token }) {
      // Ensure role and status flow through to middleware via req.auth
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.roles = token.roles as ("ADMIN" | "FOUNDER")[];
        session.user.status = token.status as "PENDING" | "APPROVED" | "REJECTED";
      }
      return session;
    },
  },
};
