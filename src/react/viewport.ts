/**
 * Visual-viewport publication — the binding's sixth job (architecture.md §1).
 *
 * On iOS the soft keyboard shrinks the visual viewport and leaves the layout
 * viewport — what `position: fixed`, `100%` and `100dvh` size against — at
 * full height, then pans the visual viewport inside it to reveal the focused
 * field. Nothing in CSS knows where the keyboard is, and `innerHeight` is
 * not to be trusted either: iOS can shrink it alongside the keyboard and
 * snap it back. The one reliable signal is `window.visualViewport`, so while
 * an Editor is mounted its rectangle is published as custom properties on
 * the root element, in layout-viewport coordinates, and a skin pins its
 * shell to that rectangle in CSS:
 *
 *   .shell {
 *     position: fixed;
 *     top: var(--note-vv-top, 0px);
 *     left: var(--note-vv-left, 0px);
 *     width: var(--note-vv-width, 100%);
 *     height: var(--note-vv-height, 100%);
 *   }
 *
 * With the shell's scroller set to `overscroll-behavior: contain`, a drag
 * scrolls the content instead of panning the viewport, and a toolbar in flow
 * at the shell's bottom simply sits on the keyboard. The library measures;
 * the skin lays out. No element is moved from here, and nothing is scrolled.
 *
 * `data-note-keyboard` is set on the root while the keyboard is judged open:
 * the viewport is well below the tallest it has been at this width, zoom
 * corrected so a pinch does not count. A skin uses it to drop the
 * home-indicator padding under a bar that now sits on the keyboard.
 *
 * One publisher serves every mounted Editor; the last one out removes the
 * properties, so a page without an editor is laid out by its own rules.
 */

export const VIEWPORT_PROPERTIES = {
  top: "--note-vv-top",
  left: "--note-vv-left",
  width: "--note-vv-width",
  height: "--note-vv-height",
  scale: "--note-vv-scale",
} as const;

export const KEYBOARD_ATTRIBUTE = "data-note-keyboard";

/** What the keyboard judgement remembers: the tallest zoom-corrected height
    seen, and the layout width it was seen at. */
export type KeyboardMemory = { tallest: number; width: number };

export type ViewportReading = {
  height: number;
  scale: number;
  /** The layout viewport's width, which neither zoom nor the keyboard change. */
  layoutWidth: number;
};

// A keyboard takes 250px or more; browser chrome showing and hiding takes
// 60–100px. Between the two.
const KEYBOARD_DROP = 150;
// A width change this large is a rotation, after which what counts as tall
// starts over; anything smaller is sub-pixel jitter.
const ROTATION = 0.2;

/** Whether the keyboard is open, judged from one reading against `memory`,
    which it updates. Pure, so it can be tested with numbers. */
export function detectKeyboard(
  memory: KeyboardMemory,
  reading: ViewportReading,
): boolean {
  const height = reading.height * reading.scale;
  if (Math.abs(reading.layoutWidth - memory.width) > memory.width * ROTATION) {
    memory.width = reading.layoutWidth;
    memory.tallest = 0;
  }
  memory.tallest = Math.max(memory.tallest, height);
  return memory.tallest - height > KEYBOARD_DROP;
}

type Listener = (keyboardOpen: boolean) => void;

let subscribers = 0;
const listeners = new Set<Listener>();
let stop: (() => void) | null = null;

function publish(memory: KeyboardMemory) {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const left = vv?.offsetLeft ?? 0;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const scale = vv?.scale ?? 1;
  root.style.setProperty(VIEWPORT_PROPERTIES.top, `${top}px`);
  root.style.setProperty(VIEWPORT_PROPERTIES.left, `${left}px`);
  root.style.setProperty(VIEWPORT_PROPERTIES.width, `${width}px`);
  root.style.setProperty(VIEWPORT_PROPERTIES.height, `${height}px`);
  root.style.setProperty(VIEWPORT_PROPERTIES.scale, `${scale}`);
  const open = detectKeyboard(memory, {
    height,
    scale,
    layoutWidth: root.clientWidth,
  });
  root.toggleAttribute(KEYBOARD_ATTRIBUTE, open);
  for (const listener of listeners) listener(open);
}

/**
 * Keeps the viewport published for as long as the subscription lasts. The
 * optional listener is told, after each publication, whether the keyboard is
 * open — the moment to reveal a field the shell just re-laid itself around.
 * Returns the unsubscribe.
 */
export function subscribeViewport(listener?: Listener): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (listener) listeners.add(listener);
  subscribers += 1;
  if (!stop) {
    const memory: KeyboardMemory = { tallest: 0, width: 0 };
    const update = () => publish(memory);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    stop = () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      const root = document.documentElement;
      for (const property of Object.values(VIEWPORT_PROPERTIES)) {
        root.style.removeProperty(property);
      }
      root.removeAttribute(KEYBOARD_ATTRIBUTE);
    };
    update();
  }
  return () => {
    if (listener) listeners.delete(listener);
    subscribers -= 1;
    if (subscribers === 0 && stop) {
      stop();
      stop = null;
    }
  };
}
