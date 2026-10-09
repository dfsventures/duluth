import { granolaIntakeEnabled } from "@/lib/granola";
import BoardClient from "./board-client";

// Server wrapper: env presence is only known server-side. Never pass values, only the boolean.
export const dynamic = "force-dynamic";

export default function BoardPage() {
  return <BoardClient granolaIntake={granolaIntakeEnabled()} />;
}
