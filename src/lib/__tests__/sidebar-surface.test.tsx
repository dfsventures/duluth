import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The sidebar footer's look and theme switches follow the admin surface, not only /admin paths.
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
  it("shows the look and theme switches for an admin on the admin surface off an /admin path", () => {
    const html = renderToStaticMarkup(<Sidebar surface="admin" />);
    expect(html).toContain("Use the old look");
    expect(html).toContain("Switch to dark mode");
  });

  it("does not show them without the override (founder surface, old look)", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).not.toContain("Use the old look");
    expect(html).not.toContain("Switch to dark mode");
  });

  it("never shows them to a non-admin, even with the override", () => {
    state.roles = ["FOUNDER"];
    const html = renderToStaticMarkup(<Sidebar surface="admin" />);
    expect(html).not.toContain("Use the old look");
    expect(html).not.toContain("Switch to dark mode");
  });
});
