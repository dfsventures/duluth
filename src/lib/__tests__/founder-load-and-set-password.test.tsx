import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { SetPasswordForm } from "@/app/set-password/set-password-form";

const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf-8");

// B-229: /links and /team stayed on the skeleton on a fresh load. Their loader was memoised before
// the company context settled and never rebuilt, so the effect re-ran a stale closure that bailed
// out. The loader must depend on the company context, and the effect only on the loader.
describe.each([
  ["links", "app/links/page.tsx"],
  ["team", "app/team/page.tsx"],
])("founder %s page loads once the company is known", (_name, file) => {
  const src = read(file);
  const loader = src.slice(src.indexOf("const loadData = useCallback("));
  const loaderDeps = loader.match(/\n {2}\}, \[([^\]]*)\]\);/)?.[1] ?? "";

  it("rebuilds the loader when the company context changes", () => {
    expect(loaderDeps).toContain("companyLoading");
    expect(loaderDeps).toMatch(/\bselectedCompany\b/);
  });

  it("runs the loader from an effect that depends on the loader only (no fetch loop)", () => {
    expect(src).toMatch(/useEffect\(\(\) => \{\s*loadData\(\);\s*\}, \[loadData\]\);/);
  });
});

// /set-password read the server-only SUPPORT_EMAIL inside a client component, so the server HTML
// and the browser disagreed (hydration error). The server page reads it and passes it down.
describe("set-password support address", () => {
  it("the page is a server component that reads SUPPORT_EMAIL", () => {
    const page = read("app/set-password/page.tsx");
    expect(page).not.toContain('"use client"');
    expect(page).toContain("process.env.SUPPORT_EMAIL");
  });

  it("the client form never reads process.env", () => {
    expect(read("app/set-password/set-password-form.tsx")).not.toContain("process.env");
  });

  it("shows the address it is given (no token: the invalid-link state)", () => {
    const html = renderToStaticMarkup(<SetPasswordForm supportEmail="help@example.com" />);
    expect(html).toContain("mailto:help@example.com");
    expect(html).toContain(">help@example.com</a>");
  });
});
