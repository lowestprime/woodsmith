import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { retiredPublicCopy } from "./public-copy-normalization.ts";

const sourceFiles = [
  "../app/page.tsx",
  "../app/portfolio/page.tsx",
  "../app/portfolio/[slug]/page.tsx",
  "../app/shop/page.tsx",
  "../app/about/page.tsx",
  "../app/contact/page.tsx",
  "../app/commissions/page.tsx",
  "../app/process/page.tsx",
  "../app/search/page.tsx",
  "../app/account/login/page.tsx",
  "../app/account/signup/page.tsx",
  "../app/account/forgot/page.tsx",
  "../app/account/profile/page.tsx",
  "../app/account/projects/page.tsx",
  "../app/commissions/status/page.tsx",
  "../components/forms.tsx",
  "../components/site-chrome.tsx"
] as const;

async function read(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("fresh public seeds match the normalized launch copy", async () => {
  const seed = await read("./seed.ts");

  assert.match(seed, /brandTagline:\s*"Furniture and cabinetry from the Beaman woodshop\."/);
  assert.doesNotMatch(seed, /San Francisco/);
  assert.match(seed, /\{ label: "Custom", href: "\/commissions" \}/);
  assert.doesNotMatch(seed, /id:\s*"website-credit"/);
  assert.doesNotMatch(seed, /id:\s*"repository"/);
  assert.match(seed, /"Built around a durable black phenolic resin work surface\."/);
  assert.match(seed, /"Bird's-eye maple rails contrast with white maple legs\."/);
  assert.match(seed, /"Dimensions, cable handling, and drawer options are set for each commission\."/);
  assert.match(seed, /intro:\s*"Tables, benches, cabinetry, and smaller pieces from the Beaman woodshop\."/);

  for (const retired of retiredPublicCopy) {
    assert.equal(seed.includes(retired), false, `seed still contains retired public copy: ${retired}`);
  }
});

test("public routes do not expose retired implementation language", async () => {
  const sources = await Promise.all(sourceFiles.map(read));
  const combined = sources.join("\n");

  for (const retired of retiredPublicCopy) {
    assert.equal(combined.includes(retired), false, `public source still contains retired copy: ${retired}`);
  }

  for (const pattern of [
    /private dashboard/i,
    /public profile urls/i,
    /private project workflow/i,
    /public site handles/i,
    /FTS5 lexical/i,
    /who designed the website/i,
    /Website design and development by/i,
    /Website source/i
  ]) {
    assert.doesNotMatch(combined, pattern);
  }
});

test("contact stays compact while the custom planner remains guided", async () => {
  const [form, contact, commissions, home] = await Promise.all([
    read("../components/forms.tsx"),
    read("../app/contact/page.tsx"),
    read("../app/commissions/page.tsx"),
    read("../app/page.tsx")
  ]);

  assert.match(form, /guided\?: boolean/);
  assert.match(form, /if \(!piece && guided\)/);
  assert.match(form, /value=\{piece \? "piece-page" : "contact-page"\}/);
  assert.doesNotMatch(contact, /\bguided\b/);
  assert.match(commissions, /\s+guided\s+/);
  assert.match(home, /home-hero-media/);
  assert.match(home, /\bpriority\b/);
});
