import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/credentials-authorize";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { isAdminEmailDomain } from "@/lib/org";
import { currentRequestInfo, logSignInFailed, logSignInSucceeded } from "@/lib/signin-audit";
import { resolveGoogleSignIn } from "@/lib/google-signin";

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

        const resolved = await resolveGoogleSignIn({
          email,
          googleId: account.providerAccountId,
          name: user.name,
          image: user.image,
        });
        if (!resolved.ok) {
          await logSignInFailed(email, undefined, "google", resolved.reason, await currentRequestInfo());
          return "/login?error=GoogleAccountConflict";
        }
        await logSignInSucceeded(
          { id: resolved.userId, email: resolved.email },
          "google",
          await currentRequestInfo()
        );
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // Google: resolve by account id, since the reported email can differ
        // from the Molly account's (see src/lib/google-signin.ts).
        const dbUser =
          account?.provider === "google"
            ? await db.user.findUnique({ where: { googleId: account.providerAccountId } })
            : await db.user.findUnique({ where: { email: user.email! } });
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
