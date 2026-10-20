import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { currentTemplate } from "@/lib/memo-template";
import TemplateEditor from "./template-editor";

export const dynamic = "force-dynamic";

export default async function MemoTemplatePage() {
  const session = await auth();
  if (!session?.user?.roles.includes("ADMIN") || session.user.status !== "APPROVED") redirect("/login");
  const template = await currentTemplate();
  return <TemplateEditor version={template.version} sections={template.sections} />;
}
