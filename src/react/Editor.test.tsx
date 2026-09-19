// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NoteStore } from "../core/store";
import { NoteProvider } from "./context";
import { Editor } from "./Editor";

function mount(store: NoteStore, autoFocus?: boolean) {
  return render(
    <NoteProvider store={store}>
      <Editor autoFocus={autoFocus}>
        {({ fieldProps }) => <textarea {...fieldProps} />}
      </Editor>
    </NoteProvider>,
  );
}

// jsdom lays nothing out and has no scrollIntoView; the focus effect's
// reveal step needs one to call.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  (document.activeElement as HTMLElement | null)?.blur();
});

describe("Editor autoFocus", () => {
  it("places the caret at the start of the first row on mount", () => {
    const store = new NoteStore({ initial: "- alpha\n- beta" });
    const { container } = mount(store, true);
    const first = container.querySelector("textarea")!;
    expect(store.getState().focus).toEqual({
      id: store.getState().rows[0].id,
      offset: 0,
    });
    expect(document.activeElement).toBe(first);
    expect(first.selectionStart).toBe(0);
  });

  it("does nothing without the prop", () => {
    const store = new NoteStore({ initial: "- alpha" });
    mount(store);
    expect(store.getState().focus).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("yields to a focus the store already has", () => {
    const store = new NoteStore({ initial: "- alpha\n- beta" });
    const second = store.getState().rows[1];
    store.dispatch({ type: "focusRow", id: second.id, offset: 2 });
    const { container } = mount(store, true);
    expect(store.getState().focus).toEqual({ id: second.id, offset: 2 });
    expect(document.activeElement).toBe(container.querySelectorAll("textarea")[1]);
  });

  it("is read once, on mount", () => {
    const store = new NoteStore({ initial: "- alpha" });
    const { rerender } = mount(store, false);
    rerender(
      <NoteProvider store={store}>
        <Editor autoFocus>{({ fieldProps }) => <textarea {...fieldProps} />}</Editor>
      </NoteProvider>,
    );
    expect(store.getState().focus).toBeNull();
  });

  it("does not fire onAction: a caret placement is not an edit", () => {
    const store = new NoteStore({ initial: "- alpha" });
    let fired = 0;
    store.onAction(() => {
      fired += 1;
    });
    mount(store, true);
    act(() => {});
    expect(fired).toBe(0);
  });
});
