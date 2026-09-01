import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFooterConfiguration, normalizeHomeServices, normalizeSiteLink } from "./site-structure.ts";

test("site links accept internal, http(s), and email targets while rejecting executable schemes", () => {
  assert.equal(normalizeSiteLink("/contact", "internal-link"), "/contact");
  assert.equal(normalizeSiteLink("maker@example.com", "email"), "mailto:maker@example.com");
  assert.equal(normalizeSiteLink("https://example.com/work", "external-link"), "https://example.com/work");
  assert.throws(() => normalizeSiteLink("javascript:alert(1)", "external-link"), /Links must/);
  assert.throws(() => normalizeSiteLink("//host.invalid/path", "internal-link"), /Links must/);
});

test("footer configuration validates, orders, and normalizes link behavior", () => {
  const footer = normalizeFooterConfiguration({
    introHeading: "Beaman Woodworks",
    introBody: "Built in the woodshop.",
    groups: [{
      id: "contact",
      heading: "Contact",
      visible: true,
      order: 20,
      items: [
        { id: "email", label: "Email", value: "maker@example.com", type: "email", visible: true, order: 20 },
        { id: "care", label: "Care", value: "Care guide", url: "/care", type: "internal-link", visible: true, order: 10 }
      ]
    }]
  });
  assert.deepEqual(footer.groups[0].items.map((item) => item.id), ["care", "email"]);
  assert.equal(footer.groups[0].items[1].url, "mailto:maker@example.com");
});

test("homepage service definitions are ordered and reject unsafe destinations", () => {
  const services = normalizeHomeServices([
    { id: "shop", title: "Shop", body: "Available work", href: "/shop", linkLabel: "Open shop", visible: true, order: 20 },
    { id: "portfolio", title: "Portfolio", body: "Past work", href: "/portfolio", linkLabel: "Browse", visible: true, order: 10 }
  ]);
  assert.deepEqual(services.map((service) => service.id), ["portfolio", "shop"]);
  assert.throws(() => normalizeHomeServices([{ id: "bad", title: "Bad", body: "", href: "data:text/html,x", linkLabel: "Open", visible: true, order: 1 }]), /Links must/);
});
