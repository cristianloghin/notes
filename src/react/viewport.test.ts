// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  detectKeyboard,
  KEYBOARD_ATTRIBUTE,
  subscribeViewport,
  VIEWPORT_PROPERTIES,
  type KeyboardMemory,
} from "./viewport";

describe("detectKeyboard", () => {
  const reading = (height: number, scale = 1, layoutWidth = 390) => ({
    height,
    scale,
    layoutWidth,
  });

  it("is closed until the viewport drops well below the tallest seen", () => {
    const memory: KeyboardMemory = { tallest: 0, width: 0 };
    expect(detectKeyboard(memory, reading(844))).toBe(false);
    // Browser chrome showing: not a keyboard.
    expect(detectKeyboard(memory, reading(760))).toBe(false);
    // A keyboard.
    expect(detectKeyboard(memory, reading(500))).toBe(true);
    // Back up.
    expect(detectKeyboard(memory, reading(844))).toBe(false);
  });

  it("ignores a pinch zoom, which shrinks the height but not the scaled height", () => {
    const memory: KeyboardMemory = { tallest: 0, width: 0 };
    detectKeyboard(memory, reading(844));
    expect(detectKeyboard(memory, reading(422, 2))).toBe(false);
  });

  it("starts over after a rotation, so a shorter landscape is not a keyboard", () => {
    const memory: KeyboardMemory = { tallest: 0, width: 0 };
    detectKeyboard(memory, reading(844, 1, 390));
    expect(detectKeyboard(memory, reading(390, 1, 844))).toBe(false);
    expect(detectKeyboard(memory, reading(150, 1, 844))).toBe(true);
  });

  it("does not start over on sub-pixel width jitter", () => {
    const memory: KeyboardMemory = { tallest: 0, width: 0 };
    detectKeyboard(memory, reading(844, 1, 390));
    expect(detectKeyboard(memory, reading(500, 1, 391))).toBe(true);
  });
});

describe("subscribeViewport", () => {
  const root = () => document.documentElement;
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
  });

  it("publishes the viewport on the root while subscribed, and clears it after", () => {
    const unsubscribe = subscribeViewport();
    cleanups.push(unsubscribe);
    // jsdom has no visualViewport; the window's own size stands in.
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.height)).toBe(
      `${window.innerHeight}px`,
    );
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.top)).toBe("0px");
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.scale)).toBe("1");
    expect(root().hasAttribute(KEYBOARD_ATTRIBUTE)).toBe(false);
    unsubscribe();
    cleanups.pop();
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.height)).toBe("");
  });

  it("keeps publishing until the last subscriber is gone", () => {
    const first = subscribeViewport();
    const second = subscribeViewport();
    cleanups.push(first, second);
    first();
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.width)).not.toBe("");
    second();
    cleanups.splice(0);
    expect(root().style.getPropertyValue(VIEWPORT_PROPERTIES.width)).toBe("");
  });

  it("tells a listener whether the keyboard is open on each publication", () => {
    const seen: boolean[] = [];
    cleanups.push(subscribeViewport((open) => seen.push(open)));
    expect(seen).toEqual([false]);
    window.dispatchEvent(new Event("resize"));
    expect(seen).toEqual([false, false]);
  });
});
