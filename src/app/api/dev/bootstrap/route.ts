export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { ADMIN_EMAIL_DOMAIN } from "@/lib/org";

// ⚠️  DEV ONLY — this route is disabled in production
// Approves all pending users with a known token so you can test without Google OAuth

export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_BOOTSTRAP !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const DEV_TOKEN = "dev-token-123";
    const DEV_ADMIN_EMAIL = `admin@${ADMIN_EMAIL_DOMAIN}`;
    const DEV_ADMIN_PASSWORD = "password123";

    // 1. Create or update a dev admin user (email/password, no Google needed)
    const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
    await db.user.upsert({
      where: { email: DEV_ADMIN_EMAIL },
      update: { passwordHash, status: "APPROVED", roles: ["ADMIN"] },
      create: {
        email: DEV_ADMIN_EMAIL,
        name: "Dev Admin",
        passwordHash,
        roles: ["ADMIN"],
        status: "APPROVED",
      },
    });

    // 2. Set a known token on all PENDING users
    const pendingUsers = await db.user.findMany({ where: { status: "PENDING" } });
    for (const user of pendingUsers) {
      await db.user.update({
        where: { id: user.id },
        data: {
          approvalToken: DEV_TOKEN,
          tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
        },
      });
    }

    return NextResponse.json({
      message: "Bootstrap complete",
      adminEmail: DEV_ADMIN_EMAIL,
      adminPassword: DEV_ADMIN_PASSWORD,
      pendingUsersPatched: pendingUsers.length,
      setPasswordUrl: `http://localhost:3001/set-password?token=${DEV_TOKEN}`,
    });
  } catch (error) {
    console.error("Bootstrap error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
