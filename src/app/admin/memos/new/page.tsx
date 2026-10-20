import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { memoCompanyFilter } from "@/lib/memos";
import NewMemoForm from "./new-memo-form";

export const dynamic = "force-dynamic";

export default async function NewMemoPage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const companies = await db.company.findMany({
    where: memoCompanyFilter,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <NewMemoForm companies={companies} />;
}
