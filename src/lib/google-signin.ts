import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Resolves a Google sign-in to a Molly user. The Google account id is the
 * stable key: when someone's Google primary address changes (e.g. dfs.vc to
 * dfslab.net), the email Google reports changes but the account id does not,
 * so we match on the id first and keep the existing Molly account.
 *
 * Domain checks happen before this is called. Never auto-merges accounts.
 */
export type GoogleSignInResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "google_account_conflict" };

export async function resolveGoogleSignIn(input: {
  email: string;
  googleId: string;
  name?: string | null;
  image?: string | null;
}): Promise<GoogleSignInResult> {
  const { email, googleId } = input;

  const byGoogle = await db.user.findUnique({ where: { googleId } });
  if (byGoogle) return { ok: true, userId: byGoogle.id, email: byGoogle.email };

  const byEmail = await db.user.findUnique({ where: { email } });
  if (byEmail) {
    // Linked to a different Google account: an admin has to sort this out.
    if (byEmail.googleId && byEmail.googleId !== googleId) {
      return { ok: false, reason: "google_account_conflict" };
    }
    await db.user.update({
      where: { id: byEmail.id },
      data: { googleId, image: input.image ?? byEmail.image },
    });
    return { ok: true, userId: byEmail.id, email: byEmail.email };
  }

  try {
    const created = await db.user.create({
      data: {
        email,
        name: input.name,
        image: input.image,
        googleId,
        roles: ["ADMIN"],
        status: "APPROVED",
      },
    });
    return { ok: true, userId: created.id, email: created.email };
  } catch (err) {
    // Lost a race with a concurrent first sign-in: treat as a conflict, never throw.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "google_account_conflict" };
    }
    throw err;
  }
}
