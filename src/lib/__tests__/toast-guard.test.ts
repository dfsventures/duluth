import { describe, it, expect, vi } from "vitest";
import { ignoreToastInteraction, isToastTarget, TOAST_VIEWPORT_ATTR } from "../toast-guard";

const inside = { closest: (sel: string) => (sel === `[${TOAST_VIEWPORT_ATTR}]` ? {} : null) };
const outside = { closest: () => null };

describe("toast guard", () => {
  it("recognises targets inside the toast viewport", () => {
    expect(isToastTarget(inside)).toBe(true);
    expect(isToastTarget(outside)).toBe(false);
    expect(isToastTarget(null)).toBe(false);
  });
  it("stops a dialog dismissing itself for a toast press, and only then", () => {
    const keep = vi.fn();
    ignoreToastInteraction({ target: inside as unknown as EventTarget, preventDefault: keep });
    expect(keep).toHaveBeenCalledTimes(1);
    const dismiss = vi.fn();
    ignoreToastInteraction({ target: outside as unknown as EventTarget, preventDefault: dismiss });
    expect(dismiss).not.toHaveBeenCalled();
  });
});
