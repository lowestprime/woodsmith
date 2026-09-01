import assert from "node:assert/strict";
import test from "node:test";
import { setInlineNavigationGuard } from "./inline-edit-navigation.ts";

test("inline edit navigation guard follows a nested editable node to its link", () => {
  const calls: Array<[string, EventListener, boolean]> = [];
  const anchor = {
    addEventListener(type: string, listener: EventListener, capture: boolean) {
      calls.push([`add:${type}`, listener, capture]);
    },
    removeEventListener(type: string, listener: EventListener, capture: boolean) {
      calls.push([`remove:${type}`, listener, capture]);
    },
  };
  const element = {
    closest(selector: string) {
      assert.equal(selector, "a[href]");
      return anchor;
    },
  } as unknown as HTMLElement;
  const listener = (() => undefined) as EventListener;

  setInlineNavigationGuard(element, true, listener);
  setInlineNavigationGuard(element, false, listener);

  assert.deepEqual(calls, [
    ["add:click", listener, true],
    ["remove:click", listener, true],
  ]);
});

test("inline edit navigation guard ignores editable nodes outside links", () => {
  const element = {
    closest() {
      return null;
    },
  } as unknown as HTMLElement;

  assert.doesNotThrow(() => {
    setInlineNavigationGuard(element, true, (() => undefined) as EventListener);
  });
});
