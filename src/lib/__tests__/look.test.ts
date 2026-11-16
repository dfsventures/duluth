// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyLook, readLook, setLook, setTheme, PRE_PAINT_SCRIPT, LOOK_KEY, THEME_KEY } from "../look";

// New look switch (PLAN-1, WS156): saved in the browser, and any storage trouble
// means the old look. Node environment, so storage and document are stubbed.

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

describe("readLook", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the old look with no storage at all", () => {
    expect(readLook()).toEqual({ look: "v1", theme: "light" });
  });

  it("is the old look when nothing is saved", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(readLook()).toEqual({ look: "v1", theme: "light" });
  });

  it("reads a saved new look and dark theme", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [LOOK_KEY]: "v2", [THEME_KEY]: "dark" }));
    expect(readLook()).toEqual({ look: "v2", theme: "dark" });
  });

  it("treats unexpected values as the old look and light theme", () => {
    vi.stubGlobal("localStorage", fakeStorage({ [LOOK_KEY]: "v3", [THEME_KEY]: "purple" }));
    expect(readLook()).toEqual({ look: "v1", theme: "light" });
  });

  it("falls back to the old look when reading throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLook()).toEqual({ look: "v1", theme: "light" });
  });

  it("falls back to the old look when even touching localStorage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(readLook()).toEqual({ look: "v1", theme: "light" });
    } finally {
      // @ts-expect-error cleaning the stub up
      delete globalThis.localStorage;
    }
  });
});

describe("applyLook", () => {
  it("sets nothing at all for the old look, and clears leftovers", () => {
    const root = fakeRoot();
    applyLook({ look: "v1", theme: "dark" }, root);
    expect(root.dataset).toEqual({});
    root.dataset.look = "v2";
    root.dataset.theme = "dark";
    applyLook({ look: "v1", theme: "light" }, root);
    expect(root.dataset.look).toBeUndefined();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("sets look and theme for the new look", () => {
    const root = fakeRoot();
    applyLook({ look: "v2", theme: "dark" }, root);
    expect(root.dataset).toEqual({ look: "v2", theme: "dark" });
  });
});

describe("setLook / setTheme", () => {
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

  it("turning the new look on saves it and sets the attributes", () => {
    expect(setLook("v2")).toEqual({ look: "v2", theme: "light" });
    expect(store.data[LOOK_KEY]).toBe("v2");
    expect(root.dataset).toEqual({ look: "v2", theme: "light" });
  });

  it("turning it off removes the saved key and the attributes but keeps the theme choice", () => {
    setLook("v2");
    setTheme("dark");
    setLook("v1");
    expect(store.data[LOOK_KEY]).toBeUndefined();
    expect(store.data[THEME_KEY]).toBe("dark");
    expect(root.dataset).toEqual({});
    setLook("v2");
    expect(root.dataset).toEqual({ look: "v2", theme: "dark" });
  });

  it("changing the theme while the new look is on updates the attribute", () => {
    setLook("v2");
    setTheme("dark");
    expect(root.dataset.theme).toBe("dark");
    setTheme("light");
    expect(root.dataset.theme).toBe("light");
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
    expect(() => setLook("v2")).not.toThrow();
    expect(root.dataset.look).toBe("v2");
    setTheme("dark"); // storage is dead, so it trusts what is already on <html>
    expect(root.dataset).toEqual({ look: "v2", theme: "dark" });
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

  it("does nothing when the switch is off or nothing is saved", () => {
    expect(run({})).toEqual({});
    expect(run({ [THEME_KEY]: "dark" })).toEqual({}); // a saved theme alone never turns the new look on
    expect(run({ [LOOK_KEY]: "v1", [THEME_KEY]: "dark" })).toEqual({});
  });

  it("sets look and theme when the new look is on, and defaults to light", () => {
    expect(run({ [LOOK_KEY]: "v2" })).toEqual({ look: "v2", theme: "light" });
    expect(run({ [LOOK_KEY]: "v2", [THEME_KEY]: "dark" })).toEqual({ look: "v2", theme: "dark" });
    expect(run({ [LOOK_KEY]: "v2", [THEME_KEY]: "bogus" })).toEqual({ look: "v2", theme: "light" });
  });

  it("swallows storage errors", () => {
    expect(run({}, true)).toEqual({});
  });
});
