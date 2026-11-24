// Local visual-check toolkit, step 2: screenshot the admin pages in every look, theme and size.
// Run: npx tsx scripts/visual/shoot.ts [--pages companies,approvals] [--looks new,old]
//        [--viewports desktop,wide,phone] [--out /some/dir] [--no-states] [--focus]
// --focus: Tab through each page in the new look (first size only) and report invisible or low-contrast
// focus in focus.json (WS167).
//
// Starts its own `next dev -p 3100` against molly_local (unless something already answers there),
// signs in as the seeded admin by minting a session cookie, takes the pictures, then stops the
// server it started. Playwright lives outside the repo (see README.md).
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { BASE_URL, LOCAL_AUTH_SECRET, LOCAL_PORT, applyLocalEnv, localEnv } from "./env";

applyLocalEnv(); // sets the local env and enforces the molly_local guard

const REPO = process.cwd(); // run from the repo root
const PLAYWRIGHT_DIR = "/Users/josephbenson/.cache/molly-visual";
const COOKIE_NAME = "authjs.session-token"; // Auth.js v5, plain http; the cookie name is also the JWT salt
const LOOK_KEY = "molly.look"; // keep in step with src/lib/look.ts
const THEME_KEY = "molly.theme";

const PAGES: Record<string, string> = {
  dashboard: "/admin",
  companies: "/admin/companies",
  updates: "/admin/updates",
  approvals: "/admin/approvals",
  deals: "/admin/portfolio", // the deal ledger
  memos: "/admin/memos",
  board: "/admin/board",
  fund: "/admin/funds", // opens the funds list, then the first fund's detail page (ids are random)
  funds: "/admin/funds", // the funds list itself (WS169)
  company: "/admin/companies", // opens the companies list, then the first company's own page (WS163)
  deal: "/admin/portfolio", // opens the Deal Ledger, then the first company's own page (ids are random; WS163)
  memo: "/admin/memos", // opens the memos board, then the first memo's own page (ids are random; WS163)
  update: "/admin/updates", // opens the updates list, then the first update's own page (ids are random; WS163)
  reports: "/admin/reports",
  broadcasts: "/admin/broadcasts",
  digest: "/admin/digest",
  lps: "/admin/lps",
  audit: "/admin/audit", // WS170: the last 100 events, compact rows
  contacts: "/admin/portfolio-contacts", // WS170: the Contacts tab
  "contacts-links": "/admin/portfolio-contacts?tab=links", // WS170: the Links tab (two tables)
  providers: "/admin/providers", // WS171
  links: "/admin/links", // WS171: investor links (the states pass also opens the first row in the pane)
  diligence: "/admin/diligence", // WS171 (also opened in the pane in the states pass)
  settings: "/admin/settings", // WS171: the Email tab
  "settings-storage": "/admin/settings?tab=storage",
  "settings-integrations": "/admin/settings?tab=integrations",
  // WS172: editors (each opens its list, then the first row; ids are random) and the create forms.
  "digest-detail": "/admin/digest",
  "broadcast-detail": "/admin/broadcasts",
  "broadcast-sent": "/admin/broadcasts", // the last row: the sent broadcast (audit #22-#25)
  "report-detail": "/admin/reports",
  "report-preview": "/admin/reports", // the first report's preview page (the LP-look frame in the new look)
  "digest-new": "/admin/digest/new",
  "company-new": "/admin/companies/new",
  "memo-new": "/admin/memos/new",
  "memo-template": "/admin/memos/template",
  "update-new": "/admin/companies", // the first company's new-update composer
  // Page types v1: the second tabs of Updates and Funds (the old /admin/templates and /admin/sync).
  templates: "/admin/updates?tab=templates",
  sync: "/admin/funds?tab=sync",
  // Founder pages (WS165), signed in as a seeded founder (FOUNDER_AS below), not the admin.
  "f-dashboard": "/dashboard",
  "f-updates": "/updates",
  "f-update": "/updates", // the founder's updates list, then the first update's own page
  "f-update-new": "/updates/new",
  "f-from-dfs": "/from-dfs",
  "f-from-dfs-detail": "/from-dfs", // the first message
  "f-metrics": "/company/metrics",
  "f-planner": "/planner",
  "f-planner-detail": "/planner", // the first scenario
  "f-links": "/links",
  "f-profile": "/company/profile",
  "f-documents": "/company/documents",
  "f-team": "/team",
  "f-providers": "/providers",
  "f-diligence": "/diligence", // as the founder of the seeded diligence-stage company
  "f-setup": "/setup-wizard",
  // LP portal, sign-in pages and home (WS166). The public pages are shot signed out; the LP pages
  // with the seeded LP's session (LP_SESSION_TOKEN, made by setup.ts).
  home: "/",
  login: "/login",
  signup: "/signup",
  "set-password": "/set-password", // no token: the "This link isn't valid." state
  "lp-signin": "/lp",
  lp: "/lp", // the library
  "lp-report": "/lp", // the library, then the first report (also shot with print styles)
  // WS168: pages that keep their own look (they must not change when the new look becomes the default)
  share: "/share/visual-token-active", // the seeded active investor link (setup.ts)
  // B-249: the seeded link with two selected updates, one with attached files; shot past the
  // email gate with both updates opened (share-files-open__*.png).
  "share-files": "/share/visual-token-files",
  investors: "/investors",
};

// WS166: pages shot with no admin or founder session, and the LP pages (the LP's own cookie).
const SIGNED_OUT = new Set(["home", "login", "signup", "set-password", "lp-signin", "share", "share-files", "investors"]);
const AS_LP = new Set(["lp", "lp-report"]);
const LP_COOKIE = "lp_session"; // keep in step with src/lib/lp-auth.ts
const LP_SESSION_TOKEN = "local-visual-lp-session"; // keep in step with setup.ts

// Founder pages sign in as a founder: the owner of a current company, or of the diligence-stage one.
const FOUNDER_AS: Record<string, string> = Object.fromEntries(
  Object.keys(PAGES)
    .filter((k) => k.startsWith("f-"))
    .map((k) => [k, k === "f-diligence" ? "amara@piedpiper-cloud.example.com" : "jane@acme-robotics.example.com"])
);

// Page types v1 (docs/design/page-types-v1.md §10): every page's type, for the alignment check.
const PAGE_TYPE: Record<string, "list" | "detail" | "editor"> = {
  dashboard: "list", companies: "list", updates: "list", templates: "list", approvals: "list", deals: "list",
  memos: "list", board: "list", funds: "list", sync: "list", reports: "list", broadcasts: "list", digest: "list",
  lps: "list", audit: "list", contacts: "list", "contacts-links": "list", providers: "list", links: "list",
  diligence: "list",
  fund: "detail", company: "detail", deal: "detail", memo: "detail", update: "detail", settings: "detail",
  "settings-storage": "detail", "settings-integrations": "detail", "digest-detail": "detail", "broadcast-sent": "detail",
  "broadcast-detail": "editor", "report-detail": "editor", "report-preview": "editor", "digest-new": "editor",
  "company-new": "editor", "memo-new": "editor", "memo-template": "editor", "update-new": "editor",
};

// The alignment check. After a page loads in the new look, measure the marked elements (data-align,
// set by the shared components) and compare each page with the others of its type.
type Marks = Partial<Record<"titleX" | "titleY" | "backX" | "backY" | "descY" | "tabsX" | "tabsY" | "filtersX" | "filtersY" | "theadX" | "theadY" | "actionsR" | "actionsY" | "frameR", number>>;
const alignRows: { vp: string; key: string; type: string; shape: string; m: Marks }[] = [];

// Plain browser JavaScript as a string: tsx would otherwise wrap named functions in a helper the page
// does not have.
const MEASURE_JS = `(() => {
  const main = document.getElementById("main-content");
  if (main) main.scrollTo(0, 0);
  function first(sel) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r;
    }
    return null;
  }
  const m = {};
  function put(k, v) { if (v !== undefined && v !== null) m[k] = Math.round(v * 10) / 10; }
  const title = first('main [data-page-head] [data-align="title"]') || first('main [data-align="title"]') || first("main h1");
  put("titleX", title && title.left); put("titleY", title && title.top);
  const back = first('main [data-align="back"]');
  put("backX", back && back.left); put("backY", back && back.top);
  const desc = first('main [data-align="desc"]');
  put("descY", desc && desc.top);
  const tabs = first('main [data-align="tabs"]');
  put("tabsX", tabs && tabs.left); put("tabsY", tabs && tabs.top);
  const filters = first('main [data-align="filters"]');
  put("filtersX", filters && filters.left); put("filtersY", filters && filters.top);
  const thead = first('main [data-align="thead"]:not(.sr-only)');
  const stats = first('main [data-align="stats"]');
  put("theadX", thead && thead.left); put("theadY", thead && thead.top);
  const actions = first('main [data-align="actions"]');
  put("actionsR", actions && actions.right); put("actionsY", actions && actions.top);
  const frame = document.querySelector(".shell-page");
  if (frame) {
    const r = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);
    const left = r.left + (parseFloat(cs.paddingLeft) || 0);
    put("frameR", r.right - (parseFloat(cs.paddingRight) || 0));
    // Left edges are reported from the content's left edge (frames differ in width by type: a Detail
    // page may be 1056, 1296 or 720 wide), so 0 means "on the content edge".
    for (const k of ["titleX", "backX", "tabsX", "filtersX", "theadX"]) if (k in m) m[k] = Math.round((m[k] - left) * 10) / 10;
  }
  // A section heading (h2) between the header and the table moves the table down on purpose.
  let section = false;
  if (thead && title) {
    for (const h of Array.from(document.querySelectorAll("main h2"))) {
      const r = h.getBoundingClientRect();
      if (r.height > 0 && r.top > title.bottom && r.bottom <= thead.top) section = true;
    }
  }
  // Editors: a document title field (28/36 input, meta 8 under) and a form heading (24/32 h1, description
  // 4 under) are two variants of the type (page types v1, §4.3), so their description lines sit apart.
  const titleEl = document.querySelector('main [data-align="title"]');
  const doc = !!titleEl && (titleEl.tagName === "INPUT" || titleEl.tagName === "TEXTAREA");
  const shape = [doc ? "doc" : "", back ? "back" : "", desc ? "desc" : "", tabs ? "tabs" : "", stats ? "stats" : "", filters ? "filt" : "", section ? "h2" : ""].filter(Boolean).join("+") || "plain";
  return { m, shape };
})()`;

// The 390px check (WS165): does the page scroll sideways, and which tap targets are under 44px? A link
// inside a sentence (its parent is a p, li or span of running text) is listed apart: it is a word in
// the text, not a control. Plain browser JavaScript, as MEASURE_JS.
const PHONE_CHECK_JS = `(() => {
  const main = document.getElementById("main-content");
  const hscroll = Math.max(
    main ? main.scrollWidth - main.clientWidth : 0,
    document.documentElement.scrollWidth - window.innerWidth
  );
  const small = [];
  const inline = [];
  const sel = 'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea, summary, [role="button"], label:has(> input[type="checkbox"]), label:has(> input[type="radio"])';
  for (const el of Array.from(document.querySelectorAll(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= 0 || el.closest("#app-sidebar")) continue; // the closed phone drawer
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || el.closest('[aria-hidden="true"], .sr-only, [hidden]')) continue;
    if (r.height >= 43.5) continue;
    const text = ((el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName) + "").trim().replace(/\\s+/g, " ").slice(0, 40);
    const item = el.tagName.toLowerCase() + " \\"" + text + "\\" " + Math.round(r.width) + "x" + Math.round(r.height);
    const p = el.parentElement;
    const inText = el.tagName === "A" && p && /^(P|LI|SPAN|DD|TD)$/.test(p.tagName) && (p.textContent || "").trim().length > (el.textContent || "").trim().length + 3;
    (inText ? inline : small).push(item);
  }
  return { hscroll: Math.round(hscroll), small, inline };
})()`;
const phoneRows: { key: string; tag: string; hscroll: number; small: string[]; inline: string[] }[] = [];

// --tall: on phones, let the page grow so the picture holds all of it, not just the first screen (the
// shell scrolls inside <main>). Only for the picture; the 390 check runs before it.
const TALL_JS = `(() => {
  const main = document.getElementById("main-content");
  const shell = main && main.parentElement;
  for (const el of [document.documentElement, document.body, shell, main]) {
    if (!el) continue;
    el.style.height = "auto";
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
  }
})()`;

// --focus (WS167): in the new look, at the first size only, press Tab through the page (up to
// FOCUS_TABS stops). At each stop read the focused element's look, then blur it and read it again: if
// nothing changed, the focus is invisible. When the change is an outline or ring, its colour's contrast
// against the background behind the element must be 3:1 (WCAG 1.4.11). Rows (a tint plus the accent
// underscore on the first cell) are read through their first cell's ::after. Runs with reduced motion so
// transitions don't leave half-drawn values. Writes focus.json and pictures at a few stops.
const FOCUS_TABS = 40;
const FOCUS_SNAP_AT = new Set([3, 8, 15]);
const FOCUS_JS = `((phase) => {
  const el = phase === "read" ? document.activeElement : window.__focusEl;
  if (!el || el === document.body || el === document.documentElement) return null;
  function parse(c) {
    const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(c || "");
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  function lum(c) {
    const ch = [c.r, c.g, c.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function ratio(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function behind(node) {
    // The first ancestor with a mostly opaque background (the page's own colour as a last resort).
    for (let n = node.parentElement; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  }
  function look(node) {
    const cs = getComputedStyle(node);
    const cell = node.tagName === "TR" ? node.querySelector("td") : null;
    const after = cell ? getComputedStyle(cell, "::after") : null;
    return {
      outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor,
      shadow: cs.boxShadow,
      bg: cs.backgroundColor,
      border: cs.borderColor,
      color: cs.color,
      deco: cs.textDecorationLine,
      after: after ? after.content + " " + after.backgroundColor + " " + after.width : "",
    };
  }
  if (phase === "read") {
    window.__focusEl = el;
    const r = el.getBoundingClientRect();
    const name = ((el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "") + "").trim().replace(/\\s+/g, " ").slice(0, 40);
    const on = look(el);
    const base = behind(el);
    let ring = null;
    const cs = getComputedStyle(el);
    // Tailwind's outline-none is "2px solid transparent": a transparent outline is no outline.
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) {
      const c = parse(cs.outlineColor);
      if (c && c.a > 0.5) ring = { kind: "outline", width: cs.outlineWidth, ratio: +ratio(c, base).toFixed(2) };
    }
    if (!ring && cs.boxShadow && cs.boxShadow !== "none") {
      let best = 0;
      for (const m of cs.boxShadow.matchAll(/rgba?\\([^)]*\\)/g)) {
        const c = parse(m[0]);
        if (c && c.a > 0.5) best = Math.max(best, ratio(c, base));
      }
      if (best > 0) ring = { kind: "ring", ratio: +best.toFixed(2) };
    }
    if (!ring && el.tagName === "TR") {
      const cell = el.querySelector("td");
      const c = cell ? parse(getComputedStyle(cell, "::after").backgroundColor) : null;
      if (c && c.a > 0.5) ring = { kind: "row underscore", ratio: +ratio(c, parse(cs.backgroundColor) && parse(cs.backgroundColor).a > 0.5 ? parse(cs.backgroundColor) : base).toFixed(2) };
    }
    const desc = el.tagName.toLowerCase() + (el.getAttribute("role") ? "[" + el.getAttribute("role") + "]" : "") + ' "' + name + '"';
    const inSidebar = !!el.closest("#app-sidebar, .app-sidebar");
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    return { desc, on, ring, inSidebar, visible };
  }
  const off = (el.blur(), look(el));
  el.focus({ preventScroll: true });
  return { off };
})`;
type FocusStop = { key: string; tag: string; n: number; desc: string; verdict: "ring" | "changed" | "none" | "low"; detail: string };
const focusRows: FocusStop[] = [];

async function measure(page: any): Promise<{ m: Marks; shape: string }> {
  return page.evaluate(MEASURE_JS);
}

function mode(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(Math.round(v), (counts.get(Math.round(v)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// Which marks must agree across a type. Y positions below the header depend on what the header holds
// (a back line, a description, tabs), so those are compared within pages of the same shape.
const SAME_TYPE: (keyof Marks)[] = ["titleX", "backX", "tabsX", "filtersX", "theadX"];
const SAME_SHAPE: (keyof Marks)[] = ["titleY", "backY", "descY", "tabsY", "filtersY", "theadY", "actionsY"];

function alignReport(): number {
  let flags = 0;
  const vps = [...new Set(alignRows.map((r) => r.vp))];
  for (const vp of vps) {
    console.log(
      `\nAlignment, ${vp} (X: px from the content's left edge, so 0 = on the edge; Y and the right edges: px from the window's top-left; * = off its type by more than 1px)`
    );
    for (const type of ["list", "detail", "editor"]) {
      const rows = alignRows.filter((r) => r.vp === vp && r.type === type);
      if (!rows.length) continue;
      const ref = (k: keyof Marks, shape?: string) =>
        mode(rows.filter((r) => shape === undefined || r.shape === shape).map((r) => r.m[k]).filter((v): v is number => v !== undefined));
      const cols: (keyof Marks)[] = ["titleX", "titleY", "backX", "backY", "descY", "tabsX", "tabsY", "filtersX", "filtersY", "theadX", "theadY", "actionsR", "frameR"];
      console.log(`  ${type.toUpperCase()}`);
      console.log("  " + ["page".padEnd(22), "shape".padEnd(15), ...cols.map((c) => c.padStart(9))].join(""));
      for (const r of rows) {
        if (r.shape === "error") flags++; // a page that could not be measured counts as a flag
        const cells = cols.map((c) => {
          const v = r.m[c];
          if (v === undefined) return "-".padStart(9);
          let target: number | undefined;
          if (SAME_TYPE.includes(c)) target = ref(c);
          else if (SAME_SHAPE.includes(c)) target = ref(c, r.shape);
          else if (c === "actionsR") target = r.m.frameR; // the actions end on the frame's right edge
          const off = target !== undefined && Math.abs(v - target) > 1;
          if (off) flags++;
          return `${off ? "*" : ""}${Math.round(v)}`.padStart(9);
        });
        console.log("  " + [r.key.padEnd(22), r.shape.padEnd(15), ...cells].join(""));
      }
    }
  }
  console.log(flags ? `\nAlignment: ${flags} flag(s).` : "\nAlignment: no flags.");
  return flags;
}
// WS172: pages that open a list and follow its first row. `list` is the href prefix of the rows,
// `suffix` is appended to the row's href.
const FOLLOW: Record<string, { list: string; suffix?: string; last?: boolean }> = {
  "digest-detail": { list: "/admin/digest/" },
  "broadcast-detail": { list: "/admin/broadcasts/" },
  // The seeded list is sorted newest first, so the draft is first and the sent broadcast (with its deliveries) is last.
  "broadcast-sent": { list: "/admin/broadcasts/", last: true },
  "report-detail": { list: "/admin/reports/" },
  "report-preview": { list: "/admin/reports/", suffix: "/preview" },
  "update-new": { list: "/admin/companies/", suffix: "/updates/new" },
  "f-update": { list: "/updates/" },
  "f-from-dfs-detail": { list: "/from-dfs/" },
  "f-planner-detail": { list: "/planner/" },
  "lp-report": { list: "/lp/reports/" },
};
const VIEWPORTS: Record<string, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  wide: { width: 1920, height: 1080 },
  phone: { width: 390, height: 844 },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function list(name: string, all: string[]): string[] {
  const raw = arg(name);
  if (!raw) return all;
  const picked = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = picked.filter((p) => !all.includes(p));
  if (bad.length) {
    console.error(`Unknown --${name} value(s): ${bad.join(", ")}. Choose from: ${all.join(", ")}`);
    process.exit(2);
  }
  return picked;
}

const pageKeys = list("pages", Object.keys(PAGES));
const looks = list("looks", ["new", "old"]);
const viewportKeys = list("viewports", Object.keys(VIEWPORTS));
const withStates = !process.argv.includes("--no-states");
const withFocus = process.argv.includes("--focus");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
// Default output stays inside the repo, in the git-ignored .visual/ folder.
const outDir = path.resolve(arg("out") ?? path.join(REPO, ".visual", stamp));
if (!outDir.startsWith(REPO + path.sep)) {
  console.error(`--out must be inside the repo (${REPO}); got ${outDir}`);
  process.exit(2);
}

const failures: string[] = [];
const written: string[] = [];

async function answers(): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/login`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

let server: ChildProcess | null = null;

async function startServer(): Promise<void> {
  if (await answers()) {
    console.warn(
      `Something already answers on port ${LOCAL_PORT}; using it. It must be a dev server started by this toolkit (pointed at molly_local).`
    );
    return;
  }
  console.log(`Starting next dev on port ${LOCAL_PORT} (first page compiles slowly) ...`);
  server = spawn("npx", ["next", "dev", "-p", String(LOCAL_PORT)], {
    cwd: REPO,
    env: { ...process.env, ...localEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // own process group so the whole tree can be stopped
  });
  const tail: string[] = [];
  const keep = (b: Buffer) => {
    tail.push(...b.toString().split("\n").filter(Boolean));
    while (tail.length > 40) tail.shift();
  };
  server.stdout?.on("data", keep);
  server.stderr?.on("data", keep);
  let exited = false;
  server.on("exit", () => {
    exited = true;
  });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (exited) {
      console.error("The dev server stopped early. Last output:\n" + tail.join("\n"));
      process.exit(1);
    }
    if (await answers()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("The dev server did not answer within 3 minutes. Last output:\n" + tail.join("\n"));
  await stopServer();
  process.exit(1);
}

async function stopServer(): Promise<void> {
  if (!server?.pid) return;
  const pid = server.pid;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  await new Promise((r) => setTimeout(r, 2000));
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  server = null;
  console.log("Stopped the dev server.");
}

async function mintSessionCookie(user: { id: string; email: string; name: string | null }, roles: string[] = ["ADMIN"]): Promise<string> {
  const { encode } = await import("next-auth/jwt");
  return encode({
    token: { id: user.id, sub: user.id, email: user.email, name: user.name, roles, status: "APPROVED" },
    secret: LOCAL_AUTH_SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60, // an hour is plenty
  });
}

async function main() {
  // Playwright is installed outside the repo.
  const req = createRequire(path.join(PLAYWRIGHT_DIR, "package.json"));
  let chromium: any;
  try {
    chromium = req("playwright").chromium;
  } catch {
    console.error(`Playwright is not installed in ${PLAYWRIGHT_DIR}. See scripts/visual/README.md.`);
    process.exit(1);
  }

  // Ids for the "states" pictures, read from the local database.
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ log: ["error"] });
  let admin: { id: string; email: string; name: string | null } | null;
  let companyId: string | undefined;
  let pendingId: string | undefined;
  let behindId: string | undefined;
  let alertId: string | undefined;
  const founders: Record<string, { id: string; email: string; name: string | null }> = {};
  let lpSession = false;
  try {
    admin = await db.user.findUnique({ where: { email: "sam@example.com" }, select: { id: true, email: true, name: true } });
    for (const email of new Set(pageKeys.map((k) => FOUNDER_AS[k]).filter(Boolean))) {
      const f = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
      if (f) founders[email] = f;
    }
    companyId = (await db.company.findFirst({ where: { name: "Acme Robotics" }, select: { id: true } }))?.id;
    pendingId = (await db.user.findUnique({ where: { email: "chidi@dunder-mifflin-paper.example.com" }, select: { id: true } }))?.id;
    behindId = (await db.company.findFirst({ where: { name: "Initech Systems" }, select: { id: true } }))?.id;
    alertId = (await db.metricAlert.findFirst({ where: { dedupeKey: "local-alert-initech-mrr" }, select: { id: true } }))?.id;
    if (pageKeys.some((k) => AS_LP.has(k))) {
      lpSession = !!(await db.lpSession.findUnique({ where: { token: LP_SESSION_TOKEN }, select: { id: true } }));
    }
  } finally {
    await db.$disconnect();
  }
  if (!admin) {
    console.error("The seeded admin was not found. Run: npx tsx scripts/visual/setup.ts");
    process.exit(1);
  }

  const cookie = await mintSessionCookie(admin);
  const founderCookies: Record<string, string> = {};
  for (const [email, f] of Object.entries(founders)) founderCookies[email] = await mintSessionCookie(f, ["FOUNDER"]);
  const missing = [...new Set(pageKeys.map((k) => FOUNDER_AS[k]).filter((e) => e && !founderCookies[e]))];
  if (missing.length) {
    console.error(`Seeded founder(s) not found: ${missing.join(", ")}. Run: npx tsx scripts/visual/setup.ts`);
    process.exit(1);
  }
  if (pageKeys.some((k) => AS_LP.has(k)) && !lpSession) {
    console.error("The seeded LP session was not found (the LP pages need it). Run: npx tsx scripts/visual/setup.ts");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  await startServer();

  const browser = await chromium.launch();
  let authBroken = false;

  type Variant = { look: "new" | "old"; theme: "light" | "dark" };
  const variants: Variant[] = [];
  for (const look of looks as ("new" | "old")[]) {
    variants.push({ look, theme: "light" });
    if (look === "new") variants.push({ look, theme: "dark" }); // dark exists only in the new look
  }

  // Opens a URL, waits for it to settle and checks it is a real page. Returns false when it is not.
  async function open(page: any, label: string, url: string): Promise<boolean> {
    const res = await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    // Client pages fetch after load: wait (up to 20s) until no loading skeleton is left.
    await page.waitForFunction("!document.querySelector('.animate-skeleton-pulse')", undefined, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(700);

    if (new URL(page.url()).pathname.startsWith("/login") && !url.startsWith("/login")) {
      failures.push(`${label}: redirected to /login (sign-in did not work)`);
      authBroken = true;
      return false;
    }
    const status = res?.status() ?? 0;
    const bodyText: string = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const overlay = (await page.locator("nextjs-portal").count().catch(() => 0)) > 0;
    if (status >= 400 || overlay || /Application error|Internal Server Error|This page could not be found|Unhandled Runtime Error/.test(bodyText)) {
      failures.push(`${label}: error page (HTTP ${status}${overlay ? ", dev error overlay" : ""})`);
      return false;
    }
    return true;
  }

  // Finds the first (or last) row link on a list page: an href under `prefix` with exactly `parts`
  // slash-separated parts, not ending in any of `exclude`. A slow list can still be fetching its rows
  // after open() settles, so this waits for one to appear (up to ROW_WAIT_MS) instead of reading the
  // page once and skipping it (B-221). Returns null only when no row shows up in that time.
  const ROW_WAIT_MS = 30_000;
  async function rowHref(page: any, prefix: string, parts: number, exclude: string[] = [], last = false): Promise<string | null> {
    const handle = await page
      .waitForFunction(
        ([p, n, ex, l]: [string, number, string[], boolean]) => {
          const all = Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.getAttribute("href") ?? "")
            .filter((h) => h.startsWith(p) && h.split("/").length === n && !ex.some((e) => h.endsWith(e)));
          return (l ? all[all.length - 1] : all[0]) ?? null;
        },
        [prefix, parts, exclude, last] as [string, number, string[], boolean],
        { timeout: ROW_WAIT_MS }
      )
      .catch(() => null);
    return handle ? ((await handle.jsonValue()) as string) : null;
  }

  async function snap(page: any, file: string, fullPage = true) {
    const target = path.join(outDir, file);
    await page.screenshot({ path: target, fullPage });
    written.push(file);
    console.log(`  ${file}`);
  }

  // --focus: the Tab walk described at FOCUS_JS. The page is left scrolled; it runs after the page's picture.
  async function focusWalk(page: any, key: string, tag: string) {
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    await page.evaluate("document.activeElement && document.activeElement.blur()");
    let lastDesc = "";
    let repeats = 0;
    let flaggedShots = 0;
    for (let n = 1; n <= FOCUS_TABS; n++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(60);
      const on = await page.evaluate(`${FOCUS_JS}("read")`).catch(() => null);
      if (!on) break; // focus left the page
      const back = await page.evaluate(`${FOCUS_JS}("off")`).catch(() => null);
      if (on.desc === lastDesc) {
        if (++repeats > 2) break; // a focus trap or the end of the page
      } else repeats = 0;
      lastDesc = on.desc;
      if (!on.visible) continue; // an element scrolled out of view or a skip link at rest
      const changed = back ? Object.keys(on.on).filter((k) => on.on[k] !== back.off[k]) : [];
      let verdict: FocusStop["verdict"];
      let detail: string;
      // A ring counts only when it appears on focus (a resting box-shadow edge is not a focus ring).
      const ringShown = on.ring && changed.some((k) => k === "outline" || k === "shadow" || k === "after");
      if (ringShown) {
        verdict = on.ring.ratio >= 3 ? "ring" : "low";
        detail = `${on.ring.kind} ${on.ring.ratio}:1`;
      } else if (changed.length) {
        verdict = "changed";
        detail = changed.map((k) => `${k}: ${back.off[k]} -> ${on.on[k]}`).join("; ").slice(0, 300);
      } else {
        verdict = "none";
        detail = "nothing changes on focus";
      }
      focusRows.push({ key, tag, n, desc: on.desc + (on.inSidebar ? " (sidebar)" : ""), verdict, detail });
      // Pictures at a few fixed stops, and at the first few stops that need a look.
      const flagged = verdict !== "ring" && ++flaggedShots <= 4;
      if (FOCUS_SNAP_AT.has(n) || flagged) await snap(page, `focus-${n}__${key}__${tag}.png`, false);
    }
  }

  for (const v of variants) {
    for (const vpKey of viewportKeys) {
      if (authBroken) break;
      const tag = `${v.look}-${v.theme}__${vpKey}`;
      const context = await browser.newContext({ viewport: VIEWPORTS[vpKey] });
      await context.addCookies([{ name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
      await context.addInitScript(
        ([lookKey, themeKey, lookValue, themeValue]: (string | null)[]) => {
          try {
            if (lookValue) localStorage.setItem(lookKey as string, lookValue);
            else localStorage.removeItem(lookKey as string);
            localStorage.setItem(themeKey as string, themeValue as string);
          } catch {
            /* storage unavailable */
          }
        },
        [LOOK_KEY, THEME_KEY, v.look === "new" ? "v2" : null, v.theme]
      );

      const watch = (page: any, label: string) => {
        page.on("console", (m: any) => {
          if (m.type() === "error") {
            const text = String(m.text());
            // React's hooks-order warning names the component in its arguments and lists the hooks after
            // the first 300 characters: print it whole.
            console.warn(`  [console error] ${label}: ${/order of Hooks/.test(text) ? text.slice(0, 3000) : text.slice(0, 300)}`);
          }
        });
        page.on("pageerror", (e: Error) => console.warn(`  [page error] ${label}: ${e.message.slice(0, 300)}`));
      };

      console.log(`\n${tag}`);
      for (const key of pageKeys) {
        if (authBroken) break;
        // Founder pages sign in as their founder; everything else as the admin.
        // WS166: public pages signed out, LP pages with only the LP's cookie.
        if (SIGNED_OUT.has(key) || AS_LP.has(key)) {
          await context.clearCookies();
          if (AS_LP.has(key)) await context.addCookies([{ name: LP_COOKIE, value: LP_SESSION_TOKEN, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
        } else {
          const asCookie = FOUNDER_AS[key] ? founderCookies[FOUNDER_AS[key]] : cookie;
          await context.addCookies([{ name: COOKIE_NAME, value: asCookie, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
        }
        const page = await context.newPage();
        watch(page, `${key} ${tag}`);
        let ok = await open(page, `${key} ${tag}`, PAGES[key]);
        // Detail pages open their list first, then follow its first row (ids are random).
        const DETAIL: Record<string, { prefix: string; parts: number; exclude?: string[]; list: string }> = {
          fund: { prefix: "/admin/funds/", parts: 4, list: "/admin/funds" },
          company: { prefix: "/admin/companies/", parts: 4, exclude: ["/new"], list: "/admin/companies" },
          deal: { prefix: "/admin/portfolio/", parts: 4, list: "/admin/portfolio" },
          memo: { prefix: "/admin/memos/", parts: 4, exclude: ["/template"], list: "/admin/memos" },
          update: { prefix: "/updates/", parts: 3, exclude: ["/new"], list: "/admin/updates" },
        };
        if (ok && DETAIL[key]) {
          const d = DETAIL[key];
          const href = await rowHref(page, d.prefix, d.parts, d.exclude);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no ${key} link appeared on ${d.list} within ${ROW_WAIT_MS / 1000}s`);
        }
        if (ok && FOLLOW[key]) {
          const { list: prefix, suffix = "", last = false } = FOLLOW[key];
          const depth = prefix.split("/").length - 1; // "/admin/digest/" -> 3 segments after the first slash
          const href = await rowHref(page, prefix, depth + 1, ["/new"], last);
          ok = href ? await open(page, `${key} ${tag}`, href + suffix) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no row link appeared under ${prefix} within ${ROW_WAIT_MS / 1000}s`);
        }
        if (ok && vpKey === "phone" && v.theme === "light") {
          const r = await page.evaluate(PHONE_CHECK_JS).catch(() => null);
          if (r) phoneRows.push({ key, tag, ...r });
        }
        if (ok && vpKey === "phone" && process.argv.includes("--tall")) {
          await page.evaluate(TALL_JS).catch(() => {});
          await page.waitForTimeout(200);
        }
        if (ok) await snap(page, `${key}__${tag}.png`);
        if (ok && withFocus && v.look === "new" && vpKey === viewportKeys[0]) await focusWalk(page, key, tag);
        // WS166: the LP report as it prints (white pages, dark text, in both themes).
        if (ok && key === "lp-report" && vpKey !== "phone") {
          await page.emulateMedia({ media: "print" });
          await page.waitForTimeout(200);
          await snap(page, `lp-report-print__${tag}.png`);
          await page.emulateMedia({ media: "screen" });
        }
        // B-233: the founder composer with its details open and two files picked (one allowed, one not).
        if (ok && key === "f-update-new") {
          const toggle = page.getByRole("button", { name: /Details — metrics & attachments/ });
          const input = page.locator('input[type="file"][aria-label="Attach files"]');
          if ((await toggle.count()) > 0) {
            await toggle.click();
            await page.waitForTimeout(200);
            if ((await input.count()) > 0) {
              await input.setInputFiles([
                { name: "Q3 board deck.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(48_000, 1) },
                { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
              ]);
              await page.waitForTimeout(300);
              await page.locator('ul[aria-label="Attached files"]').scrollIntoViewIfNeeded().catch(() => {});
              await page.waitForTimeout(200);
              await snap(page, `f-update-attach__${tag}.png`, false);
            }
          } else {
            console.warn("  no details toggle found on /updates/new");
          }
        }
        // B-249: past the email gate (the page's own localStorage key), then every update opened.
        if (ok && key === "share-files") {
          await page.evaluate(() => localStorage.setItem("share_viewer_visual-token-files", "viewer@example.com"));
          await page.reload({ waitUntil: "networkidle" }).catch(() => {});
          await page.waitForTimeout(400);
          const headers = page.locator("section button").filter({ hasText: /update, \d{4}-\d{2}/ }); // seeded titles
          const n = await headers.count();
          for (let i = 0; i < n; i++) {
            await headers.nth(i).click();
            await page.waitForTimeout(150);
          }
          if (n === 0) console.warn("  no update headers found on the share-files page");
          await snap(page, `share-files-open__${tag}.png`);
        }
        // B-176: the memo's Details sheet (round and ask), opened from the ⋯ menu.
        if (ok && key === "memo") {
          const more = page.getByRole("button", { name: "More actions" }).first();
          if ((await more.count()) > 0) {
            await more.click();
            const item = page.getByRole("menuitem", { name: "Edit details" });
            if ((await item.count()) > 0) {
              await item.click();
              await page.locator("#meta-round").waitFor({ timeout: 5000 }).catch(() => {});
              await page.locator("#meta-round").scrollIntoViewIfNeeded().catch(() => {});
              await page.waitForTimeout(300);
              await snap(page, `memo-details__${tag}.png`, false);
            } else {
              console.warn("  no Edit details item in the memo's ⋯ menu");
            }
          } else {
            console.warn("  no More actions button on the memo page");
          }
        }
        if (ok && v.look === "new" && v.theme === "light" && vpKey !== "phone" && PAGE_TYPE[key]) {
          const { m, shape } = await measure(page).catch(() => ({ m: {} as Marks, shape: "error" }));
          alignRows.push({ vp: vpKey, key, type: PAGE_TYPE[key], shape, m });
        }
        await page.close();
      }

      // States: only in the new look, and only at the first requested size.
      if (withStates && v.look === "new" && vpKey === viewportKeys[0] && !authBroken) {
        // The states are admin pages: put the admin's cookie back after any founder page.
        await context.addCookies([{ name: COOKIE_NAME, value: cookie, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
        if (pageKeys.includes("companies") && companyId) {
          let page = await context.newPage();
          watch(page, `companies-pane ${tag}`);
          if (await open(page, `companies-pane ${tag}`, `/admin/companies?open=${companyId}`)) await snap(page, `companies-pane__${tag}.png`);
          await page.close();

          page = await context.newPage();
          watch(page, `companies-hover ${tag}`);
          if (await open(page, `companies-hover ${tag}`, "/admin/companies")) {
            const row = page.locator("tbody tr").nth(1);
            if ((await row.count()) > 0) {
              await row.hover();
              await page.waitForTimeout(300);
              await snap(page, `companies-hover__${tag}.png`, false);
            } else {
              console.warn("  no table row found to hover on /admin/companies");
            }
          }
          await page.close();
        }
        // WS171: Investor Links and Diligence with the first row open in the pane.
        for (const [key, path] of [["links", "/admin/links"], ["diligence", "/admin/diligence"]] as const) {
          if (!pageKeys.includes(key)) continue;
          const page = await context.newPage();
          watch(page, `${key}-pane ${tag}`);
          if (await open(page, `${key}-pane ${tag}`, path)) {
            const row = page.locator("tbody tr[data-row]").first();
            if ((await row.count()) > 0) {
              await row.click();
              await page.waitForTimeout(500);
              await snap(page, `${key}-pane__${tag}.png`);
            } else {
              console.warn(`  no table row found to open on ${path}`);
            }
          }
          await page.close();
        }
        if (pageKeys.includes("approvals") && pendingId) {
          const page = await context.newPage();
          watch(page, `approvals-pane ${tag}`);
          if (await open(page, `approvals-pane ${tag}`, `/admin/approvals?open=${pendingId}`)) await snap(page, `approvals-pane__${tag}.png`);
          await page.close();
        }
        // Needs you with a pane open: a company behind on updates (Remind) and a metric alert (Dismiss).
        if (pageKeys.includes("dashboard")) {
          for (const [name, id] of [["behind", behindId ? `overdue:${behindId}` : undefined], ["alert", alertId ? `alert:${alertId}` : undefined]] as const) {
            if (!id) continue;
            const page = await context.newPage();
            watch(page, `needs-you-pane-${name} ${tag}`);
            if (await open(page, `needs-you-pane-${name} ${tag}`, `/admin?open=${encodeURIComponent(id)}`)) await snap(page, `needs-you-pane-${name}__${tag}.png`);
            await page.close();
          }
        }
        if (pageKeys.includes("dashboard")) {
          const page = await context.newPage();
          watch(page, `palette ${tag}`);
          if (await open(page, `palette ${tag}`, "/admin")) {
            await page.keyboard.press("Meta+k");
            await page.waitForTimeout(600);
            await snap(page, `palette__${tag}.png`, false);
            // WS164: `?` opens the shortcut sheet once Esc has closed the palette.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(300);
            await page.keyboard.press("?");
            await page.waitForTimeout(600);
            await snap(page, `shortcuts-help__${tag}.png`, false);
          }
          await page.close();
        }
        // WS164: on Companies the palette's company items open the pane ("Open <company>"), and `f`
        // opens the palette on "Filter: " for the list.
        if (pageKeys.includes("companies")) {
          const page = await context.newPage();
          watch(page, `palette-companies ${tag}`);
          if (await open(page, `palette-companies ${tag}`, "/admin/companies")) {
            await page.keyboard.press("Meta+k");
            await page.waitForTimeout(600);
            await page.keyboard.type("acme");
            await page.waitForTimeout(600);
            await snap(page, `palette-companies__${tag}.png`, false);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(500);
            await page.keyboard.press("f");
            await page.waitForTimeout(600);
            await page.keyboard.type("acme");
            await page.waitForTimeout(400);
            await snap(page, `palette-filter__${tag}.png`, false);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(800);
            await snap(page, `palette-filter-applied__${tag}.png`, false);
          }
          await page.close();
        }
      }
      await context.close();
    }
  }
  await browser.close();
}

// --diff <before> --against <after> (WS168): compares two earlier runs, file by file, without shooting
// anything. Both are folder names under .visual/. For each file in both, it prints how many pixels
// differ (any channel off by more than 8) and the box they fall in, and writes diff__<file> (changed
// pixels in red over a faded copy of the after shot) into the after folder. No new package: the
// comparison runs on a canvas in the same Chromium the shots use.
const DIFF_JS = `async ([a, b]) => {
  const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
  const draw = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
  const da = draw(ia), db = draw(ib);
  const out = new ImageData(w, h);
  let n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < da.data.length; i += 4) {
    const off = Math.abs(da.data[i] - db.data[i]) > 8 || Math.abs(da.data[i + 1] - db.data[i + 1]) > 8 || Math.abs(da.data[i + 2] - db.data[i + 2]) > 8 || Math.abs(da.data[i + 3] - db.data[i + 3]) > 8;
    if (off) {
      n++;
      const p = i / 4, x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255;
    } else {
      out.data[i] = db.data[i]; out.data[i + 1] = db.data[i + 1]; out.data[i + 2] = db.data[i + 2]; out.data[i + 3] = 60;
    }
  }
  let png = null;
  if (n) { const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").putImageData(out, 0, 0); png = c.toDataURL("image/png"); }
  return { n, total: w * h, sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], box: n ? [x0, y0, x1, y1] : null, png };
}`;

async function runDiff(before: string, after: string) {
  const dirA = path.resolve(REPO, ".visual", before);
  const dirB = path.resolve(REPO, ".visual", after);
  for (const d of [dirA, dirB]) {
    if (!d.startsWith(path.join(REPO, ".visual") + path.sep) || !fs.existsSync(d)) {
      console.error(`No such run under .visual/: ${d}`);
      process.exit(2);
    }
  }
  const { chromium } = createRequire(path.join(PLAYWRIGHT_DIR, "package.json"))("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const files = fs.readdirSync(dirB).filter((f: string) => f.endsWith(".png") && !f.startsWith("diff__") && fs.existsSync(path.join(dirA, f)));
  const onlyA = fs.readdirSync(dirA).filter((f: string) => f.endsWith(".png") && !f.startsWith("diff__") && !fs.existsSync(path.join(dirB, f)));
  let changed = 0;
  console.log(`Diff ${before} -> ${after}: ${files.length} pair(s)`);
  for (const f of files.sort()) {
    const url = (d: string) => `data:image/png;base64,${fs.readFileSync(path.join(d, f)).toString("base64")}`;
    const r = await page.evaluate(`(${DIFF_JS})(${JSON.stringify([url(dirA), url(dirB)])})`);
    const size = r.sizeA.join("x") === r.sizeB.join("x") ? r.sizeB.join("x") : `${r.sizeA.join("x")} -> ${r.sizeB.join("x")}`;
    if (!r.n) {
      console.log(`  same     ${f} (${size})`);
      continue;
    }
    changed++;
    const pct = ((100 * r.n) / r.total).toFixed(3);
    console.log(`  CHANGED  ${f} (${size}): ${r.n} px (${pct}%), box x${r.box[0]}-${r.box[2]} y${r.box[1]}-${r.box[3]}`);
    fs.writeFileSync(path.join(dirB, `diff__${f}`), Buffer.from(r.png.split(",")[1], "base64"));
  }
  for (const f of onlyA) console.log(`  missing  ${f} (only in ${before})`);
  console.log(`${changed} of ${files.length} changed.`);
  await browser.close();
}

async function run() {
  const diffBefore = arg("diff");
  if (diffBefore) {
    const after = arg("against");
    if (!after) {
      console.error("--diff <before> needs --against <after> (both folder names under .visual/)");
      process.exit(2);
    }
    await runDiff(diffBefore, after);
    return;
  }
  try {
    await main();
  } catch (err) {
    console.error(err);
    failures.push(`unexpected error: ${(err as Error).message}`);
  } finally {
    await stopServer();
  }
  console.log(`\nScreenshots: ${outDir}`);
  for (const f of written) console.log(`  ${f}`);
  console.log(`${written.length} file(s) written.`);
  if (alignRows.length) {
    fs.writeFileSync(path.join(outDir, "alignment.json"), JSON.stringify(alignRows, null, 1));
    alignReport();
  }
  if (phoneRows.length) {
    fs.writeFileSync(path.join(outDir, "phone-check.json"), JSON.stringify(phoneRows, null, 1));
    console.log("\nPhone (390) check: sideways scroll in px, and tap targets under 44px (links inside a sentence listed apart)");
    for (const r of phoneRows) {
      console.log(`  ${r.key} ${r.tag}: scroll ${r.hscroll}px, ${r.small.length} small target(s), ${r.inline.length} in-text link(s)`);
      for (const s of r.small) console.log(`      small: ${s}`);
      for (const s of r.inline) console.log(`      in text: ${s}`);
    }
  }
  if (focusRows.length) {
    fs.writeFileSync(path.join(outDir, "focus.json"), JSON.stringify(focusRows, null, 1));
    const bad = focusRows.filter((r) => r.verdict === "none" || r.verdict === "low");
    const changed = focusRows.filter((r) => r.verdict === "changed");
    console.log(`\nFocus check (Tab walk): ${focusRows.length} stops, ${bad.length} with no visible or a low-contrast focus, ${changed.length} shown by a colour/fill change only (look at those)`);
    for (const r of bad) console.log(`  ${r.verdict.toUpperCase()} ${r.key} ${r.tag} #${r.n}: ${r.desc} (${r.detail})`);
    for (const r of changed) console.log(`  changed ${r.key} ${r.tag} #${r.n}: ${r.desc} (${r.detail})`);
  }
  if (failures.length) {
    console.error(`\nFAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void stopServer().then(() => process.exit(130));
});

void run();
