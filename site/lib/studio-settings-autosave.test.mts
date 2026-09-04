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

test("notification routing uses versioned audited autosave and customer messages have separate operator paths", () => {
  const routing = actionsSource.slice(actionsSource.indexOf("export async function saveNotificationRoutingAutosaveAction"), actionsSource.indexOf("function boundedInteger"));
  assert.match(routing, /if \(!input.expectedUpdatedAt\)/);
  assert.match(routing, /executeAdminRecordAutosave/);
  assert.match(routing, /normalizeNotificationAddresses/);
  assert.match(routing, /saveNotificationForwarding\(patch.forwardTo\)/);
  assert.match(routing, /getNotificationRoutingRecord\(\)/);
  assert.doesNotMatch(actionsSource, /optionalField\(formData.get\("emailForwardTo"\)\)\s*\|\|/);
  const reply = actionsSource.slice(actionsSource.indexOf("export async function submitProjectReplyAction"), actionsSource.indexOf("export async function submitReviewAction"));
  assert.match(reply, /userCanAccessProject/);
  assert.match(reply, /withDatabaseTransaction/);
  assert.match(reply, /customer_reply_admin/);
  assert.match(reply, /eventId: id/);
  const contact = actionsSource.slice(actionsSource.indexOf("export async function submitContactRequestAction"), actionsSource.indexOf("export async function submitCommissionAction"));
  assert.match(contact, /category: "customer_inquiry_admin"/);
  assert.match(contact, /category: "commission_submitted",\s*to: persisted.guestEmail/);
  assert.match(actionsSource, /category: "review_submitted_admin"/);
  const component = readFileSync(new URL("../components/studio/notification-routing-editor.tsx", import.meta.url), "utf8");
  assert.match(component, /data-studio-autosave="ignore"/);
  assert.match(component, /Global forwarding recipients \(BCC\)/);
  assert.doesNotMatch(component, /SMTP_PASSWORD|SMTP_USER/);
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

test("shared autosave offers explicit validation recovery without bypassing conflict versions", () => {
  const source = readFileSync(new URL("../components/studio/studio-autosave-form.tsx", import.meta.url), "utf8");
  assert.match(source, /snapshot\.phase === "error"[\s\S]*?queue\.retryUnsaved\(\)/);
  assert.match(source, /snapshot\.phase === "conflict"[\s\S]*?queue\.discardUnsaved\(\);[\s\S]*?queue\.adoptCommittedEntity\(conflictedEntity, conflictedVersion\)/);
  assert.match(source, /Use latest saved version \(discard my edits\)/);
  assert.match(source, /actions=\{statusActions \|\| recoveryActions \?/);
});

test("local reservation and checkout drafts notify operators without claiming payment", () => {
  const route = readFileSync(new URL("../app/api/shop/local-reservation/route.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("assertTrustedMutationOrigin(request)") < route.indexOf("request.formData()"));
  assert.match(route, /status: 403/);
  assert.match(route, /status: 303, headers: \{ Location: path \}/);
  for (const source of [route, actions]) {
    assert.match(source, /createOrderInquiry\(/);
    assert.match(source, /normalizeNotificationAddresses/);
    assert.match(source, /consumeCommissionSubmissionQuota/);
  }
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
