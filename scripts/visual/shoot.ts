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
const outDir = path.resolve(arg("out") ?? `/tmp/molly-visual/${stamp}`);

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
  try {
    admin = await db.user.findUnique({ where: { email: "sam@example.com" }, select: { id: true, email: true, name: true } });
    companyId = (await db.company.findFirst({ where: { name: "Acme Robotics" }, select: { id: true } }))?.id;
    pendingId = (await db.user.findUnique({ where: { email: "chidi@dunder-mifflin-paper.example.com" }, select: { id: true } }))?.id;
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
        if (ok) await snap(page, `${key}__${tag}.png`);
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
        if (pageKeys.includes("approvals") && pendingId) {
          const page = await context.newPage();
          watch(page, `approvals-pane ${tag}`);
          if (await open(page, `approvals-pane ${tag}`, `/admin/approvals?open=${pendingId}`)) await snap(page, `approvals-pane__${tag}.png`);
          await page.close();
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
