import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadLinkTargets } from "@/lib/memo-actions";
import MemosClient from "./memos-client";

export const dynamic = "force-dynamic";

// Server wrapper: the company filter lists both stages (DILIGENCE and ACTIVE), plus deal-ledger rows.
export default async function MemosPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const targets = await loadLinkTargets();
  return <MemosClient targets={targets} />;
}
