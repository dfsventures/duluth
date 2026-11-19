// Screenshot a design mockup (docs/design/*.html with Direction/Mode/View toggles) in a few states.
// Usage: npm run shoot:mock -- docs/design/memo-page-v1.html .visual/memo-mock
// Output must stay inside the repo (.visual/ is git-ignored).
// Toggles are buttons inside [data-g="dir"|"theme"|"view"] with data-v values (Nisat's mockup convention).
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const req = createRequire(path.join("/Users/josephbenson/.cache/molly-visual", "package.json"));
const { chromium } = req("playwright");

(async () => {
  const [html, outArg] = process.argv.slice(2);
  const repo = process.cwd();
  const out = path.resolve(outArg || path.join(".visual", "mock"));
  if (!out.startsWith(repo + path.sep)) {
    console.error(`Output must be inside the repo (${repo}); got ${out}`);
    process.exit(2);
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const shots = [
    ["b", "light", "desktop"], ["b", "dark", "desktop"], ["a", "light", "desktop"],
    ["c", "light", "desktop"], ["b", "light", "phone"], ["b", "light", "print"],
  ];
  for (const [dir, theme, view] of shots) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (e) => errors.push(`${dir}/${theme}/${view}: ${e.message}`));
    await page.goto("file://" + path.resolve(html));
    for (const [g, v] of [["dir", dir], ["theme", theme], ["view", view]]) {
      await page.click(`[data-g="${g}"] button[data-v="${v}"]`, { timeout: 3000 }).catch((e) => errors.push(`click ${g}=${v}: ${e.message}`));
    }
    await page.waitForTimeout(300);
    const file = path.join(out, `${dir}-${theme}-${view}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await page.close();
  }
  await browser.close();
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No page errors.");
})();
