// Local visual-check toolkit, step 2: screenshot the admin pages in every look, theme and size.
// Run: npx tsx scripts/visual/shoot.ts [--pages companies,approvals] [--looks new,old]
//        [--viewports desktop,wide,phone] [--out /some/dir] [--no-states]
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
};

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
    const pad = parseFloat(getComputedStyle(frame).paddingRight) || 0;
    put("frameR", r.right - pad);
  }
  // A section heading (h2) between the header and the table moves the table down on purpose.
  let section = false;
  if (thead && title) {
    for (const h of Array.from(document.querySelectorAll("main h2"))) {
      const r = h.getBoundingClientRect();
      if (r.height > 0 && r.top > title.bottom && r.bottom <= thead.top) section = true;
    }
  }
  const shape = [back ? "back" : "", desc ? "desc" : "", tabs ? "tabs" : "", stats ? "stats" : "", filters ? "filt" : "", section ? "h2" : ""].filter(Boolean).join("+") || "plain";
  return { m, shape };
})()`;

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
    console.log(`\nAlignment, ${vp} (px from the window's top-left; * = off its type by more than 1px)`);
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

async function mintSessionCookie(user: { id: string; email: string; name: string | null }): Promise<string> {
  const { encode } = await import("next-auth/jwt");
  return encode({
    token: { id: user.id, sub: user.id, email: user.email, name: user.name, roles: ["ADMIN"], status: "APPROVED" },
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
  try {
    admin = await db.user.findUnique({ where: { email: "sam@example.com" }, select: { id: true, email: true, name: true } });
    companyId = (await db.company.findFirst({ where: { name: "Acme Robotics" }, select: { id: true } }))?.id;
    pendingId = (await db.user.findUnique({ where: { email: "chidi@dunder-mifflin-paper.example.com" }, select: { id: true } }))?.id;
    behindId = (await db.company.findFirst({ where: { name: "Initech Systems" }, select: { id: true } }))?.id;
    alertId = (await db.metricAlert.findFirst({ where: { dedupeKey: "local-alert-initech-mrr" }, select: { id: true } }))?.id;
  } finally {
    await db.$disconnect();
  }
  if (!admin) {
    console.error("The seeded admin was not found. Run: npx tsx scripts/visual/setup.ts");
    process.exit(1);
  }

  const cookie = await mintSessionCookie(admin);
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

    if (new URL(page.url()).pathname.startsWith("/login")) {
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

  async function snap(page: any, file: string, fullPage = true) {
    const target = path.join(outDir, file);
    await page.screenshot({ path: target, fullPage });
    written.push(file);
    console.log(`  ${file}`);
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
          if (m.type() === "error") console.warn(`  [console error] ${label}: ${String(m.text()).slice(0, 300)}`);
        });
        page.on("pageerror", (e: Error) => console.warn(`  [page error] ${label}: ${e.message.slice(0, 300)}`));
      };

      console.log(`\n${tag}`);
      for (const key of pageKeys) {
        if (authBroken) break;
        const page = await context.newPage();
        watch(page, `${key} ${tag}`);
        let ok = await open(page, `${key} ${tag}`, PAGES[key]);
        if (ok && key === "fund") {
          const href: string | null = await page
            .$$eval('a[href^="/admin/funds/"]', (as: any[]) => as.map((a) => a.getAttribute("href")).find((h) => h && h.split("/").length === 4) ?? null)
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no fund link found on /admin/funds`);
        }
        if (ok && key === "company") {
          const href: string | null = await page
            .$$eval('a[href^="/admin/companies/"]', (as: any[]) => as.map((a) => a.getAttribute("href")).find((h) => h && h.split("/").length === 4 && !h.endsWith("/new")) ?? null)
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no company link found on /admin/companies`);
        }
        if (ok && key === "deal") {
          const href: string | null = await page
            .$$eval('a[href^="/admin/portfolio/"]', (as: any[]) => as.map((a) => a.getAttribute("href")).find((h) => h && h.split("/").length === 4) ?? null)
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no deal link found on /admin/portfolio`);
        }
        if (ok && key === "memo") {
          const href: string | null = await page
            .$$eval('a[href^="/admin/memos/"]', (as: any[]) => as.map((a) => a.getAttribute("href")).find((h) => h && h.split("/").length === 4 && !h.endsWith("/template")) ?? null)
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no memo link found on /admin/memos`);
        }
        if (ok && key === "update") {
          const href: string | null = await page
            .$$eval('a[href^="/updates/"]', (as: any[]) => as.map((a) => a.getAttribute("href")).find((h) => h && h.split("/").length === 3 && !h.endsWith("/new")) ?? null)
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no update link found on /admin/updates`);
        }
        if (ok && FOLLOW[key]) {
          const { list: prefix, suffix = "", last = false } = FOLLOW[key];
          const depth = prefix.split("/").length - 1; // "/admin/digest/" -> 3 segments after the first slash
          const href: string | null = await page
            .$$eval(
              "a[href]",
              (as: any[], [p, d, l]: [string, number, boolean]) => {
                const all = as.map((a) => a.getAttribute("href") as string).filter((h) => h && h.startsWith(p) && h.split("/").length === d + 1 && !h.endsWith("/new"));
                return (l ? all[all.length - 1] : all[0]) ?? null;
              },
              [prefix, depth, last] as [string, number, boolean]
            )
            .catch(() => null);
          ok = href ? await open(page, `${key} ${tag}`, href + suffix) : false;
          if (!href) console.log(`  [skip] ${key} ${tag}: no row link found under ${prefix}`);
        }
        if (ok) await snap(page, `${key}__${tag}.png`);
        if (ok && v.look === "new" && v.theme === "light" && vpKey !== "phone" && PAGE_TYPE[key]) {
          const { m, shape } = await measure(page).catch(() => ({ m: {} as Marks, shape: "error" }));
          alignRows.push({ vp: vpKey, key, type: PAGE_TYPE[key], shape, m });
        }
        await page.close();
      }

      // States: only in the new look, and only at the first requested size.
      if (withStates && v.look === "new" && vpKey === viewportKeys[0] && !authBroken) {
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
          }
          await page.close();
        }
      }
      await context.close();
    }
  }
  await browser.close();
}

async function run() {
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
