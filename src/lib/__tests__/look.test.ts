// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyTheme, readTheme, setTheme, PRE_PAINT_SCRIPT, THEME_KEY } from "../look";

// Light / dark theme (PLAN-1, WS156; one look since WS168): saved in the browser, and any storage
// trouble means light. The old "molly.look" key is ignored. Node environment, so storage and
// document are stubbed.

const OLD_LOOK_KEY = "molly.look";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

function fakeRoot() {
  return { dataset: {} as Record<string, string | undefined> } as unknown as HTMLElement;
}

describe("readTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is light with no storage at all", () => {
    expect(readTheme()).toBe("light");
  });

  it("is light when nothing is saved", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readTheme()).toBe("light");
  });

  it("reads a saved dark theme, whatever the old look key says", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "dark" }));
    expect(readTheme()).toBe("dark");
    vi.stubGlobal("localStorage", fakeStorage({ [OLD_LOOK_KEY]: "v1", [THEME_KEY]: "dark" }));
    expect(readTheme()).toBe("dark");
  });

  it("treats unexpected values as light", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [THEME_KEY]: "purple" }));
    expect(readTheme()).toBe("light");
  });

  it("falls back to light when reading throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readTheme()).toBe("light");
  });

  it("falls back to light when even touching localStorage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(readTheme()).toBe("light");
    } finally {
      // @ts-expect-error cleaning the stub up
      delete globalThis.localStorage;
    }
  });
});

describe("applyTheme", () => {
  it("sets data-theme and nothing else", () => {
    const root = fakeRoot();
    applyTheme("dark", root);
    expect(root.dataset).toEqual({ theme: "dark" });
    applyTheme("light", root);
    expect(root.dataset).toEqual({ theme: "light" });
  });
});

describe("setTheme", () => {
  let store: ReturnType<typeof fakeStorage>;
  let root: HTMLElement;
  beforeEach(() => {
    store = fakeStorage();
    root = fakeRoot();
    vi.stubGlobal("localStorage", store);
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves the theme and updates the attribute", () => {
    expect(setTheme("dark")).toBe("dark");
    expect(store.data[THEME_KEY]).toBe("dark");
    expect(root.dataset).toEqual({ theme: "dark" });
    setTheme("light");
    expect(store.data[THEME_KEY]).toBe("light");
    expect(root.dataset).toEqual({ theme: "light" });
  });

  it("still applies in this tab when saving throws (private mode)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => setTheme("dark")).not.toThrow();
    expect(root.dataset).toEqual({ theme: "dark" });
  });
});

describe("pre-paint script", () => {
  function run(items: Record<string, string>, throwing = false) {
    const root = fakeRoot();
    const ls = throwing
      ? {
          getItem: () => {
            throw new Error("blocked");
          },
        }
      : fakeStorage(items);
    new Function("localStorage", "document", PRE_PAINT_SCRIPT)(ls, { documentElement: root });
    return root.dataset;
  }

  it("always sets data-theme, light by default", () => {
    expect(run({})).toEqual({ theme: "light" });
    expect(run({ [THEME_KEY]: "bogus" })).toEqual({ theme: "light" });
  });

  it("keeps a saved dark theme, and ignores the old look key either way", () => {
    expect(run({ [THEME_KEY]: "dark" })).toEqual({ theme: "dark" });
    expect(run({ [OLD_LOOK_KEY]: "v1", [THEME_KEY]: "dark" })).toEqual({ theme: "dark" });
    expect(run({ [OLD_LOOK_KEY]: "v2" })).toEqual({ theme: "light" });
  });

  it("never sets data-look", () => {
    expect(run({ [OLD_LOOK_KEY]: "v2", [THEME_KEY]: "dark" }).look).toBeUndefined();
  });

  it("falls back to light on storage errors", () => {
    expect(run({}, true)).toEqual({ theme: "light" });
  });
});
