import { afterEach, describe, expect, it, vi } from "vitest";
import { fetcher, FetchError } from "@/lib/fetcher";

afterEach(() => vi.unstubAllGlobals());

describe("fetcher", () => {
  it("returns parsed JSON on 2xx and bypasses the HTTP cache", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) });
    vi.stubGlobal("fetch", f);
    await expect(fetcher("/x")).resolves.toEqual({ a: 1 });
    expect(f).toHaveBeenCalledWith("/x", { cache: "no-store" });
  });

  it("throws FetchError with the server message and status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) }));
    await expect(fetcher("/x")).rejects.toMatchObject({ message: "Forbidden", status: 403, name: "FetchError" });
  });

  it("falls back to a status message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("no"); } }));
    const err = (await fetcher("/x").catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(FetchError);
    expect(err.message).toBe("Server error (500)");
  });
});
