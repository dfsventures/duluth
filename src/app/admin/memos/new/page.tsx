import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadLinkTargets } from "@/lib/memo-actions";
import NewMemoForm from "./new-memo-form";

export const dynamic = "force-dynamic";

export default async function NewMemoPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const targets = await loadLinkTargets();
  return <NewMemoForm targets={targets} />;
}
