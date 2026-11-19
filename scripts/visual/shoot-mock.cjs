// Screenshot a design mockup (docs/design/*.html with Direction/Mode/View toggles) in a few states.
// Usage: npm run shoot:mock -- memo-page-v1   (pictures go to .visual/mock-memo-page-v1/)
// Output must stay inside the repo (.visual/ is git-ignored).
// Toggles are buttons inside [data-g="dir"|"theme"|"view"] with data-v values (Nisat's mockup convention).
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const req = createRequire(path.join("/Users/josephbenson/.cache/molly-visual", "package.json"));
const { chromium } = req("playwright");

(async () => {
  // Takes a mockup name (memo-page-v1 → docs/design/memo-page-v1.html), so no paths are needed on the command line.
  const [nameArg, outArg] = process.argv.slice(2);
  const repo = process.cwd();
  const html = /[\\/]/.test(nameArg || "") ? nameArg : path.join("docs", "design", `${(nameArg || "").replace(/\.html$/, "")}.html`);
  const out = path.resolve(outArg || path.join(".visual", `mock-${path.basename(html, ".html")}`));
  if (!out.startsWith(repo + path.sep)) {
    console.error(`Output must be inside the repo (${repo}); got ${out}`);
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  // Each shot is a list of [group, value] toggle clicks. Per-mockup lists; the default is the memo mockup's.
  const name = path.basename(html, ".html");
  const t = (dir, theme, view, extra = []) => [["dir", dir], ["theme", theme], ["view", view], ...extra];
  const SHOTS = {
    "page-types-v1": [
      ...["list", "detail", "editor"].flatMap((d) => [
        t(d, "light", "desktop"), t(d, "light", "wide"), t(d, "dark", "wide"), t(d, "light", "phone"),
        t(d, "light", "desktop", [["look", "old"]]), t(d, "light", "desktop", [["look", "now"]]),
      ]),
      t("list", "light", "wide", [["lw", "cap"]]),
      t("list", "light", "desktop", [["state", "filters"]]),
      t("list", "light", "desktop", [["state", "empty"]]),
      t("list", "light", "desktop", [["state", "scrolled"]]),
      t("detail", "light", "desktop", [["state", "long"]]),
      t("editor", "light", "desktop", [["state", "scrolled"]]),
      t("editor", "light", "desktop", [["state", "preview"]]),
      t("list", "light", "desktop", [["guides", "on"]]),
      t("editor", "light", "desktop", [["guides", "on"]]),
    ],
  };
  const shots = SHOTS[name] || [
    t("b", "light", "desktop"), t("b", "dark", "desktop"), t("a", "light", "desktop"),
    t("c", "light", "desktop"), t("b", "light", "phone"), t("b", "light", "print"),
  ];
  for (const clicks of shots) {
    const label = clicks.map(([, v]) => v).join("-");
    const wide = clicks.some(([g, v]) => g === "view" && v === "wide");
    const page = await browser.newPage({ viewport: wide ? { width: 1920, height: 1080 } : { width: 1440, height: 900 } });
    page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    await page.goto("file://" + path.resolve(html));
    for (const [g, v] of clicks) {
      await page.click(`[data-g="${g}"] button[data-v="${v}"]`, { timeout: 3000 }).catch((e) => errors.push(`click ${g}=${v}: ${e.message}`));
    }
    await page.waitForTimeout(300);
    const file = path.join(out, `${label}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No page errors.");
})();
