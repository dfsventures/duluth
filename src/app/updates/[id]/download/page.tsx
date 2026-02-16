"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

export default function DownloadUpdatePage() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    // Open the printable HTML version in a new tab
    window.open(`/api/updates/${id}/pdf`, "_blank");
  }, [id]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="card text-center max-w-md">
        <h2 className="text-lg font-semibold mb-2">Generating your update</h2>
        <p className="text-sm text-muted-foreground mb-4">
          A printable version has been opened in a new tab. Use your browser's
          Print function (Ctrl+P / Cmd+P) to save it as PDF.
        </p>
        <a href={`/updates/${id}`} className="btn-primary">
          Back to Update
        </a>
      </div>
    </div>
  );
}
