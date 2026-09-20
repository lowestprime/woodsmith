import test from "node:test";
import assert from "node:assert/strict";
import { processPreviewDocument } from "./process-preview.ts";

test("private preview renders current Markdown fields with escaped labels and persisted-media paths", () => {
  const fields=new FormData();fields.set("title",'<img src=x onerror="bad()">');fields.set("excerpt","Wood & joinery");fields.set("body","## Before publication\n\n**Joinery** and [source](https://example.test).\n\n<script>bad()</script>");fields.set("coverMediaPath","Uploads/preview photo.png");
  const doc=processPreviewDocument(fields);assert.match(doc,/<h2>Before publication<\/h2>/);assert.match(doc,/<strong>Joinery<\/strong>/);assert.match(doc,/Wood &amp; joinery/);assert.match(doc,/&lt;img/);assert.match(doc,/src="\/media\/Uploads\/preview%20photo.png"/);assert.doesNotMatch(doc,/<script>/);
});
