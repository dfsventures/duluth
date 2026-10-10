import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/credentials-authorize";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { isAdminEmailDomain } from "@/lib/org";
import { currentRequestInfo, logSignInFailed, logSignInSucceeded } from "@/lib/signin-audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Override Credentials provider with full DB authorize logic
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
    // Re-spread Google from authConfig if configured
    ...authConfig.providers.filter((p) => (p as any).id === "google"),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email;
        if (!email || !isAdminEmailDomain(email)) {
          await logSignInFailed(email, undefined, "google", "google_domain_refused", await currentRequestInfo());
          return false;
        }

        const existing = await db.user.findUnique({ where: { email } });
        if (!existing) {
          await db.user.create({
            data: {
              email,
              name: user.name,
              image: user.image,
              googleId: account.providerAccountId,
              roles: ["ADMIN"],
              status: "APPROVED",
            },
          });
        } else if (!existing.googleId) {
          await db.user.update({
            where: { email },
            data: { googleId: account.providerAccountId, image: user.image },
          });
        }
        const signedIn = await db.user.findUnique({ where: { email } });
        await logSignInSucceeded(
          { id: signedIn?.id, email },
          "google",
          await currentRequestInfo()
        );
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.roles = dbUser.roles;
          token.status = dbUser.status;
        }
      } else if (!token.roles || !token.status) {
        // Hydrate missing fields for sessions created before roles/status were added to the token
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
        });
        if (dbUser) {
          token.roles = dbUser.roles;
          token.status = dbUser.status;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.roles = token.roles as any;
        session.user.status = token.status as any;
      }
      return session;
    },
  },
});
