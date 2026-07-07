import { db } from "@/lib/db";
import { sendUpdatePublishedEmail } from "@/lib/email";

/**
 * Flip a DRAFT update to SENT and send the team notification.
 * The email is best-effort: a Resend failure must never roll back
 * or block the publish (matches existing behavior in both publish paths).
 * Returns the updated row, or null if the update was not a publishable draft.
 */
export async function publishUpdate(updateId: string) {
  const existing = await db.update.findUnique({
    where: { id: updateId },
    select: { status: true },
  });
  if (!existing || existing.status === "SENT") return null;

  const updated = await db.update.update({
    where: { id: updateId },
    data: { status: "SENT", sentAt: new Date(), scheduledFor: null },
  });

  try {
    const full = await db.update.findUnique({
      where: { id: updateId },
      include: {
        company: { select: { id: true, name: true } },
        metricValues: { include: { metricDefinition: { select: { name: true, unit: true } } } },
      },
    });
    if (full) {
      await sendUpdatePublishedEmail({
        companyName: full.company.name,
        companyId: full.company.id,
        updateId: full.id,
        title: full.title,
        period: full.period,
        body: full.body,
        metrics: full.metricValues.map((mv) => ({
          name: mv.metricDefinition.name,
          unit: mv.metricDefinition.unit,
          value: Number(mv.value),
        })),
      });
    }
  } catch (emailErr) {
    console.error("Failed to send publish email:", emailErr);
  }

  return updated;
}
