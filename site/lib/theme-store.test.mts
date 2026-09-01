import assert from "node:assert/strict";
import test from "node:test";

import {
  applyExternalThemeSnapshot,
  publishTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemeMode
} from "./theme-store.ts";

function target() {
  const calls = {
    documentThemes: [] as ThemeMode[],
    cookies: [] as string[],
    storage: [] as Array<[string, ThemeMode]>,
    notifications: [] as string[]
  };
  return {
    calls,
    value: {
      setDocumentTheme: (theme: ThemeMode) => calls.documentThemes.push(theme),
      setCookie: (cookie: string) => calls.cookies.push(cookie),
      setStoredTheme: (key: string, theme: ThemeMode) => calls.storage.push([key, theme]),
      notify: (eventName: string) => calls.notifications.push(eventName)
    }
  };
}

test("publishing a theme synchronizes presentation, storage, and same-tab listeners", () => {
  const runtime = target();
  publishTheme(runtime.value, "light");
  assert.deepEqual(runtime.calls.documentThemes, ["light"]);
  assert.match(runtime.calls.cookies[0], /^beaman-theme=light;/);
  assert.deepEqual(runtime.calls.storage, [[THEME_STORAGE_KEY, "light"]]);
  assert.deepEqual(runtime.calls.notifications, [THEME_CHANGE_EVENT]);
});

test("external storage snapshots update presentation without notification loops", () => {
  const runtime = target();
  assert.equal(applyExternalThemeSnapshot(runtime.value, THEME_STORAGE_KEY, "dark"), true);
  assert.deepEqual(runtime.calls.documentThemes, ["dark"]);
  assert.match(runtime.calls.cookies[0], /^beaman-theme=dark;/);
  assert.deepEqual(runtime.calls.storage, []);
  assert.deepEqual(runtime.calls.notifications, []);
  assert.equal(applyExternalThemeSnapshot(runtime.value, "unrelated", "light"), false);
  assert.equal(applyExternalThemeSnapshot(runtime.value, THEME_STORAGE_KEY, "invalid"), false);
});
