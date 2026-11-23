import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The sidebar footer's theme switch follows the admin surface, not only /admin paths. The look switch
// that sat beside it is gone (WS168: one look).
const state = vi.hoisted(() => ({ roles: ["ADMIN"] as string[] }));
vi.mock("next/navigation", () => ({ usePathname: () => "/updates/u1", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Sample Person", roles: state.roles } }, status: "authenticated" }),
  signOut: vi.fn(),
}));
vi.mock("swr", () => ({ default: () => ({ data: undefined, mutate: vi.fn() }) }));
vi.mock("@/context/company-context", () => ({ useCompany: () => ({ selectedCompany: null, companies: [] }) }));

import { Sidebar } from "@/components/layout/sidebar";

describe("Sidebar footer switches", () => {
  it("shows the theme switch, and no look switch, for an admin on the admin surface off an /admin path", () => {
    const html = renderToStaticMarkup(<Sidebar surface="admin" />);
    expect(html).toContain("Switch to dark mode");
    expect(html).not.toContain("old look");
    expect(html).not.toContain("new look");
  });

  it("does not show it without the override (founder surface)", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).not.toContain("Switch to dark mode");
  });

  it("never shows it to a non-admin, even with the override", () => {
    state.roles = ["FOUNDER"];
    const html = renderToStaticMarkup(<Sidebar surface="admin" />);
    expect(html).not.toContain("Switch to dark mode");
  });
});
