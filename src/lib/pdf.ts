import { db } from "@/lib/db";
import { formatDate, formatPeriod } from "@/lib/utils";

/**
 * Generate a simple HTML-based investor update that can be rendered as PDF.
 * We use HTML + inline CSS so it can be served as a printable page
 * (browsers can print/save as PDF natively via Ctrl+P).
 */
export async function generateUpdateHTML(updateId: string): Promise<string | null> {
  const update = await db.update.findUnique({
    where: { id: updateId },
    include: {
      company: true,
      metricValues: {
        include: { metricDefinition: true },
        orderBy: { date: "desc" },
      },
      documents: true,
    },
  });

  if (!update) return null;

  const metricsTable = update.metricValues.length
    ? `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #3BBFA0;">
          <th style="text-align: left; padding: 8px 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Metric</th>
          <th style="text-align: right; padding: 8px 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Value</th>
          <th style="text-align: right; padding: 8px 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Date</th>
        </tr>
      </thead>
      <tbody>
        ${update.metricValues
          .map(
            (mv) => `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 8px 12px; font-weight: 500;">${mv.metricDefinition.name}</td>
            <td style="padding: 8px 12px; text-align: right;">${mv.value}${mv.metricDefinition.unit ? " " + mv.metricDefinition.unit : ""}</td>
            <td style="padding: 8px 12px; text-align: right; color: #64748B;">${formatDate(mv.date)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`
    : "";

  // Body is rich HTML from the Tiptap editor — use it directly
  const bodyHtml = update.body ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(update.title)} - ${escapeHtml(update.company.name)}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1A1A2E;
      max-width: 700px;
      margin: 0 auto;
      padding: 40px 24px;
      line-height: 1.6;
      font-size: 15px;
    }
    /* Prose styles for Tiptap rich HTML content */
    .prose p { margin: 0 0 12px 0; }
    .prose h2 { font-size: 20px; font-weight: 600; margin: 24px 0 12px 0; }
    .prose h3 { font-size: 17px; font-weight: 600; margin: 20px 0 10px 0; }
    .prose h4 { font-size: 15px; font-weight: 600; margin: 16px 0 8px 0; }
    .prose ul { margin: 0 0 12px 0; padding-left: 24px; list-style-type: disc; }
    .prose ol { margin: 0 0 12px 0; padding-left: 24px; list-style-type: decimal; }
    .prose li { margin: 4px 0; }
    .prose strong { font-weight: 600; }
    .prose em { font-style: italic; }
    .prose u { text-decoration: underline; }
    .prose s { text-decoration: line-through; }
    .prose a { color: #3BBFA0; text-decoration: underline; }
    .prose blockquote {
      border-left: 3px solid #3BBFA0;
      margin: 16px 0;
      padding: 8px 16px;
      color: #64748B;
      font-style: italic;
    }
    .prose hr { border: none; border-top: 1px solid #E2E8F0; margin: 24px 0; }
    .prose img { max-width: 100%; height: auto; border-radius: 4px; margin: 12px 0; }
    .prose pre { background: #F1F5F9; border-radius: 4px; padding: 12px 16px; overflow-x: auto; }
    .prose code { background: #F1F5F9; border-radius: 3px; padding: 2px 5px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; padding: 12px; background: #E8F4F8; border-radius: 8px; text-align: center;">
    <p style="margin: 0; font-size: 14px; color: #64748B;">
      Use your browser's Print function (Ctrl+P / Cmd+P) to save as PDF.
    </p>
  </div>

  <!-- Header -->
  <div style="border-bottom: 3px solid #3BBFA0; padding-bottom: 20px; margin-bottom: 30px;">
    <h1 style="margin: 0 0 4px 0; font-size: 24px; font-weight: 600;">
      ${escapeHtml(update.company.name)}
    </h1>
    <p style="margin: 0; color: #64748B; font-size: 14px;">
      Investor Update &mdash; ${formatPeriod(update.period)}
    </p>
  </div>

  <!-- Title -->
  <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
    ${escapeHtml(update.title)}
  </h2>

  <!-- Key Metrics -->
  ${metricsTable ? `<h3 style="margin: 30px 0 10px 0; font-size: 16px; font-weight: 600; color: #3BBFA0;">Key Metrics</h3>${metricsTable}` : ""}

  <!-- Update Body -->
  <div class="prose" style="margin-top: 20px;">
    ${bodyHtml}
  </div>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0; color: #64748B; font-size: 12px;">
    <p>
      ${escapeHtml(update.company.name)}
      ${update.company.website ? ` &mdash; <a href="${escapeHtml(update.company.website)}" style="color: #3BBFA0;">${escapeHtml(update.company.website)}</a>` : ""}
    </p>
    <p>Generated on ${formatDate(new Date())}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
