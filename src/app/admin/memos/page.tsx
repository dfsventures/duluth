import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { memoCompanyFilter } from "@/lib/memos";
import MemosClient from "./memos-client";

export const dynamic = "force-dynamic";

// Server wrapper: the company filter lists both stages (DILIGENCE and ACTIVE).
export default async function MemosPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const companies = await db.company.findMany({
    where: memoCompanyFilter,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <MemosClient companies={companies} />;
}
