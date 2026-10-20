// Part 40 (WS128). The public memo page, as a self-contained HTML string.
//
// Why a string and not a React page (WS128 step 0): an App Router page cannot set a 410 status, and
// a revoked or expired link must answer 410. A route handler can, so the handler at
// /share/m/[token] returns this document. It carries its own small stylesheet (the app's CSS lives in
// hashed chunks a handler cannot reference) and one nonce'd inline script for the soft email prompt.
// That also means the page ships no app JavaScript at all, and a Content-Security-Policy that blocks
// everything except that one script makes sanitizer bypasses far less useful.
//
// Everything interpolated is escaped here, except section bodies, which are the output of
// renderMemoMarkdown (markdown-it with raw HTML off, then an allowlist sanitizer).
import { renderMemoMarkdown, shareableCitations, isInternalHost } from "@/lib/memo-render";
import { MEMO_STATUS_LABELS, validateWebUrl, type MemoCitation, type MemoStatus } from "@/lib/memos";
import { ORG_NAME } from "@/lib/org";

export interface ShareMemoInput {
  title: string;
  companyName: string | null;
  websiteUrl: string | null;
  status: string;
  updatedAt: Date;
  draftedByMarge: boolean;
  sections: { title: string; markdown: string; citations: MemoCitation[]; includeInShare: boolean }[];
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A link target that is http(s) and not one of our own internal hosts. */
function externalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = validateWebUrl(raw);
  if (!v.ok) return null;
  try {
    return isInternalHost(new URL(v.value).hostname) ? null : v.value;
  } catch {
    return null;
  }
}

const formatDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** Only the script can run; nothing loads from elsewhere; the page cannot be framed or post forms. */
export function shareCsp(nonce?: string): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'", // the unavailable-link pages carry no script
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const CSS = `
:root{--paper:#EBE8DE;--card:#fff;--bone:#D8D6CB;--ink:#14140F;--tide:#56544B;--muted:#66645A;--accent:#44688E;--tint:#E7E4DA}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 "IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:780px;margin:0 auto;padding:40px 16px 24px}
.eyebrow{margin:0 0 8px;font:600 11px/16px "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--tide)}
h1{margin:0;font:600 30px/36px "Space Grotesk",ui-sans-serif,system-ui,sans-serif;letter-spacing:-.015em}
.meta{margin:10px 0 0;color:var(--muted);font-size:14px}
.meta .sep{margin:0 6px}
.badge{display:inline-block;padding:1px 8px;border-radius:2px;background:var(--tint);color:#46443C;font:500 12px/20px "JetBrains Mono",ui-monospace,monospace}
.note{margin:12px 0 0;color:var(--muted);font-size:13px}
section{margin-top:32px;padding-top:24px;border-top:1px solid var(--bone)}
section>h2{margin:0 0 12px;font:600 19px/26px "Space Grotesk",ui-sans-serif,system-ui,sans-serif}
.prose{overflow-wrap:anywhere}
.prose h3{margin:20px 0 8px;font:600 16px/22px "Space Grotesk",ui-sans-serif,system-ui,sans-serif}
.prose h4{margin:16px 0 6px;font-size:15px}
.prose p{margin:0 0 12px}
.prose ul,.prose ol{margin:0 0 12px;padding-left:22px}
.prose blockquote{margin:0 0 12px;padding:2px 0 2px 14px;border-left:3px solid var(--bone);color:var(--tide)}
.prose code{padding:1px 4px;background:var(--tint);border-radius:2px;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
.prose pre{overflow-x:auto;padding:12px;background:var(--tint);border-radius:2px}
.prose pre code{padding:0;background:none}
.prose hr{border:0;border-top:1px solid var(--bone);margin:20px 0}
.prose table{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:14px;display:block;overflow-x:auto}
.prose th,.prose td{padding:6px 10px;border:1px solid var(--bone);text-align:left;vertical-align:top}
.prose th{background:#fff;font-weight:600}
.cites{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}
.cites li{padding:1px 8px;border-radius:2px;background:var(--tint);color:#46443C;font-size:12px;line-height:20px}
.cites a{color:var(--accent)}
footer{max-width:780px;margin:0 auto;padding:16px 16px 40px;border-top:1px solid var(--bone);color:var(--muted);font:500 11px/16px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}
.state{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.state h1{font-size:20px;line-height:28px}
.state p{margin:8px 0 0;color:var(--muted)}
.gate{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(20,20,15,.45);z-index:10}
.gate[hidden]{display:none}
.gate form{width:100%;max-width:400px;padding:24px;background:var(--card);border:1px solid var(--bone);box-shadow:0 12px 32px -12px rgba(20,20,15,.28)}
.gate h2{margin:0;font:600 17px/24px "Space Grotesk",ui-sans-serif,system-ui,sans-serif}
.gate p{margin:6px 0 14px;color:var(--muted);font-size:14px}
.gate input{width:100%;padding:8px 10px;border:1px solid var(--bone);border-radius:2px;font:inherit;background:#fff;color:var(--ink)}
.gate input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.gate button{width:100%;margin-top:12px;padding:9px 12px;border:0;border-radius:2px;background:var(--accent);color:#fff;font:600 11px/14px "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.gate button:disabled{opacity:.6;cursor:default}
.gate .err{margin:8px 0 0;color:#8F4A30;font-size:13px}
@media print{body{background:#fff}.gate{display:none!important}.wrap{padding-top:0}.prose table,.prose blockquote,.prose pre{break-inside:avoid}section>h2{break-after:avoid}a{color:inherit}}
`;

function script(token: string, nonce: string): string {
  // JSON, with "<" escaped so the value can never close the script element.
  const t = JSON.stringify(token).replace(/</g, "\\u003c");
  return `<script nonce="${nonce}">
(function(){
var token=${t};
var KEY="molly.memo.email."+token;
var gate=document.getElementById("gate");
var form=document.getElementById("gate-form");
var input=document.getElementById("gate-email");
var err=document.getElementById("gate-error");
var btn=document.getElementById("gate-submit");
var url="/api/share/m/"+encodeURIComponent(token)+"/view";
function record(email){return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email})});}
var stored=null;try{stored=localStorage.getItem(KEY);}catch(e){}
if(stored){record(stored).catch(function(){});}
else if(gate){gate.hidden=false;setTimeout(function(){try{input.focus();}catch(e){}},0);}
if(form){form.addEventListener("submit",function(ev){
ev.preventDefault();
var email=(input.value||"").trim().toLowerCase();
if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){err.textContent="Please enter a valid email address.";return;}
btn.disabled=true;err.textContent="";
record(email).then(function(r){
if(!r.ok){return r.json().then(function(b){throw new Error((b&&b.error)||"Something went wrong");},function(){throw new Error("Something went wrong");});}
try{localStorage.setItem(KEY,email);}catch(e){}
gate.hidden=true;
}).catch(function(e){err.textContent=e.message||"Something went wrong";btn.disabled=false;});
});}
})();
</script>`;
}

/** The shared memo. Sections left out of sharing, empty sections and internal URLs never reach this string. */
export function renderMemoSharePage(memo: ShareMemoInput, opts: { token: string; nonce: string }): string {
  const site = externalUrl(memo.websiteUrl);
  const status = MEMO_STATUS_LABELS[memo.status as MemoStatus] ?? memo.status;
  const meta: string[] = [];
  if (memo.companyName) meta.push(`<span>${esc(memo.companyName)}</span>`);
  if (site) {
    meta.push(`<a href="${esc(site)}" target="_blank" rel="noopener noreferrer nofollow">${esc(site.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`);
  }
  meta.push(`<span class="badge">${esc(status)}</span>`);
  meta.push(`<span>Last updated ${esc(formatDate(memo.updatedAt))}</span>`);

  const sections = memo.sections
    .filter((s) => s.includeInShare)
    .map((s) => ({ ...s, html: renderMemoMarkdown(s.markdown, { surface: "share" }), citations: shareableCitations(s.citations) }))
    .filter((s) => s.html.trim() || s.citations.length)
    .map((s) => {
      const cites = s.citations.length
        ? `<ul class="cites" aria-label="Sources">${s.citations
            .map((c) => {
              const label = esc(c.label);
              const date = c.date ? ` <span>· ${esc(formatDate(new Date(`${c.date}T00:00:00.000Z`)))}</span>` : "";
              const link = c.url ? ` <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="Open ${label}">link</a>` : "";
              return `<li>${label}${date}${link}</li>`;
            })
            .join("")}</ul>`
        : "";
      return `<section><h2>${esc(s.title)}</h2><div class="prose">${s.html}</div>${cites}</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(memo.title)} | Molly</title>
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
<p class="eyebrow">${esc(ORG_NAME)} · Investment memo</p>
<h1>${esc(memo.title)}</h1>
<p class="meta">${meta.join('<span class="sep">·</span>')}</p>
${memo.draftedByMarge ? '<p class="note">Drafted with Marge</p>' : ""}
${sections}
</main>
<footer>Shared from Molly · ${esc(ORG_NAME)}</footer>
<div id="gate" class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" hidden>
<form id="gate-form" novalidate>
<h2 id="gate-title">Enter your email to continue</h2>
<p>Your email helps the sender know who viewed this memo.</p>
<input id="gate-email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address">
<p id="gate-error" class="err" role="alert"></p>
<button id="gate-submit" type="submit">View memo</button>
</form>
</div>
${script(opts.token, opts.nonce)}
</body>
</html>`;
}

export type ShareState = "not_found" | "revoked" | "expired" | "rate_limited" | "error";
const STATES: Record<ShareState, { status: number; title: string; message: string }> = {
  not_found: { status: 404, title: "Link unavailable", message: "This link isn't valid." },
  revoked: { status: 410, title: "Link unavailable", message: "This link was turned off by the sender." },
  expired: { status: 410, title: "Link unavailable", message: "This link has expired." },
  rate_limited: { status: 429, title: "Too many requests", message: "Please try again in a little while." },
  error: { status: 500, title: "Something went wrong", message: "Please try again in a little while." },
};

/** The small "link unavailable" page, with the status the state calls for. No memo data, ever. */
export function renderShareStatePage(state: ShareState): { status: number; html: string } {
  const s = STATES[state];
  return {
    status: s.status,
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(s.title)} | Molly</title>
<style>${CSS}</style>
</head>
<body>
<main class="state">
<p class="eyebrow">${esc(ORG_NAME)}</p>
<h1>${esc(s.title)}</h1>
<p>${esc(s.message)}</p>
</main>
</body>
</html>`,
  };
}
