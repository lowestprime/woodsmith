import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const actionsSource = readFileSync(
  new URL("./actions.ts", import.meta.url),
  "utf8"
);

const studioSource = readFileSync(
  new URL(
    "../app/studio/page.tsx",
    import.meta.url
  ),
  "utf8"
);

const settingsEditorSource =
  readFileSync(
    new URL(
      "../components/studio/studio-settings-editor.tsx",
      import.meta.url
    ),
    "utf8"
  );

const categoriesEditorSource =
  readFileSync(
    new URL(
      "../components/studio/studio-categories-workspace.tsx",
      import.meta.url
    ),
    "utf8"
  );

const structureEditorSource =
  readFileSync(
    new URL(
      "../components/site-structure-editor.tsx",
      import.meta.url
    ),
    "utf8"
  );

test("settings, structure, and existing categories use coordinated shared-row queues", () => {
  assert.match(
    studioSource,
    /getSiteSettingsRecord\(\)/
  );
  assert.match(
    studioSource,
    /<StudioSettingsEditor\b/
  );
  assert.match(
    studioSource,
    /<StudioCategoriesWorkspace\b/
  );
  assert.doesNotMatch(
    studioSource,
    /action=\{saveSiteSettingsAction\}/
  );
  assert.doesNotMatch(
    studioSource,
    /saveAction=\{saveSiteStructureAction\}/
  );

  assert.equal(
    (
      settingsEditorSource.match(
        /<StudioAutosaveForm/g
      ) ?? []
    ).length,
    1
  );
  assert.equal(
    (
      categoriesEditorSource.match(
        /<StudioAutosaveForm/g
      ) ?? []
    ).length,
    1
  );
  assert.doesNotMatch(
    structureEditorSource,
    /useActionState|<form\b|settingsJson|footerJson|homeServicesJson/
  );
  assert.match(
    structureEditorSource,
    /name=\{`service-\$\{service\.id\}-title`\}/
  );
  assert.match(
    structureEditorSource,
    /name=\{`footer-item-\$\{item\.id\}-url`\}/
  );
});

test("settings and category mutations use the durable typed shell and explicit delete adoption", () => {
  for (const actionName of [
    "saveSiteSettingsAutosaveAction",
    "savePieceCategoriesAutosaveAction",
    "deletePieceCategoryAutosaveAction"
  ]) {
    assert.match(
      actionsSource,
      new RegExp(
        `${actionName}\\([\\s\\S]{0,900}?executeAdminRecordAutosave\\(`
      )
    );
  }

  assert.match(
    categoriesEditorSource,
    /<ConfirmDestructiveAction/
  );
  assert.match(
    categoriesEditorSource,
    /flushStudioNavigationQueues\(\)/
  );
  assert.match(
    categoriesEditorSource,
    /queue\.adoptCommittedEntity\(/
  );
  assert.match(
    categoriesEditorSource,
    /data-studio-autosave="ignore"/
  );
});

test("the persisted site-settings version advances monotonically", async () => {
  const previousNodeEnv =
    process.env.NODE_ENV;
  const previousDataRoot =
    process.env.DATA_ROOT;
  const dataRoot = mkdtempSync(
    path.join(
      tmpdir(),
      "woodsmith-settings-autosave-"
    )
  );

  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;

  const db = await import("./db.ts");

  try {
    db.closeDatabaseForTests();

    const first =
      db.getSiteSettingsRecord();

    db.saveSiteSettings({
      ...first.settings,
      brandTagline:
        "First monotonic save"
    });

    const second =
      db.getSiteSettingsRecord();

    db.saveSiteSettings({
      ...second.settings,
      brandTagline:
        "Second monotonic save"
    });

    const third =
      db.getSiteSettingsRecord();

    assert.ok(
      Date.parse(second.updatedAt) >
        Date.parse(first.updatedAt)
    );
    assert.ok(
      Date.parse(third.updatedAt) >
        Date.parse(second.updatedAt)
    );
    assert.equal(
      third.settings.brandTagline,
      "Second monotonic save"
    );
  } finally {
    db.closeDatabaseForTests();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        previousNodeEnv;
    }

    if (previousDataRoot === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT =
        previousDataRoot;
    }

    rmSync(dataRoot, {
      recursive: true,
      force: true
    });
  }
});
