import { describe, it, expect, beforeEach, vi } from "vitest";
import { toast, getToasts, clearToasts, dismissToast, subscribe, DURATIONS, STICKY_DURATION, MAX_TOASTS } from "../toast";

describe("toast store", () => {
  beforeEach(() => clearToasts());

  it("uses the lifetimes from the spec", () => {
    toast.success("a");
    toast.info("b");
    toast.undo("c", () => {});
    toast.error("d");
    const [s, i, u, e] = getToasts();
    expect(s.duration).toBe(4000);
    expect(i.duration).toBe(4000);
    expect(u.duration).toBe(6000);
    expect(e.duration).toBe(STICKY_DURATION);
    expect(DURATIONS.error).toBe(STICKY_DURATION);
  });

  it("undo carries an Undo action that calls back", () => {
    const fn = vi.fn();
    toast.undo("Moved", fn);
    const t = getToasts()[0];
    expect(t.kind).toBe("undo");
    expect(t.action?.label).toBe("Undo");
    t.action?.onClick();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("error with retry gets a Retry action; without it, none", () => {
    const retry = vi.fn();
    toast.error("failed", { retry });
    toast.error("failed too");
    const [a, b] = getToasts();
    expect(a.action?.label).toBe("Retry");
    a.action?.onClick();
    expect(retry).toHaveBeenCalledOnce();
    expect(b.action).toBeUndefined();
  });

  it("dismiss removes only that toast and notifies subscribers", () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    const id = toast.success("one");
    toast.success("two");
    dismissToast(id);
    expect(getToasts().map((t) => t.message)).toEqual(["two"]);
    expect(listener).toHaveBeenCalled();
    off();
  });

  it("caps the stack, dropping the oldest non-error toast first", () => {
    toast.error("keep me");
    for (let i = 0; i < MAX_TOASTS + 2; i++) toast.success(`s${i}`);
    const list = getToasts();
    expect(list.length).toBe(MAX_TOASTS);
    expect(list[0].message).toBe("keep me");
    expect(list[list.length - 1].message).toBe(`s${MAX_TOASTS + 1}`);
  });
});
