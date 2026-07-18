import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import PDFDocument from "pdfkit";

import { ensureDirectory } from "./util.js";

export type PdfAtlasPage = {
  imageFile: string;
  captureKey: string;
  route: string;
  state: string;
  auth: string;
  theme: string;
  viewport: string;
  status: string;
  assetLabel: string;
  sliceIndex: number;
  sliceCount: number;
};

export type PdfAtlasInput = {
  outputFile: string;
  title: string;
  edition: string;
  runId: string;
  mode: string;
  evidenceTier?: string;
  commit: string;
  createdAt: string;
  captureCount: number;
  routeCount: number;
  unexpectedDiagnostics: number;
  redacted: boolean;
  pages: PdfAtlasPage[];
};

const PAGE_MARGIN = 32;
const HEADER_HEIGHT = 76;
const FOOTER_HEIGHT = 22;

function boundedText(value: unknown, maxLength = 280) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function documentDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}

function addCover(document: PDFKit.PDFDocument, input: PdfAtlasInput) {
  document.addPage();
  document.outline.addItem("Visual atlas summary", { expanded: true });
  const width = document.page.width;
  const height = document.page.height;

  document.rect(0, 0, width, height).fill("#f5f0e6");
  document
    .fillColor("#17140f")
    .font("Helvetica-Bold")
    .fontSize(34)
    .text(boundedText(input.title, 160), PAGE_MARGIN, 78, { width: width - PAGE_MARGIN * 2 });
  document
    .fillColor("#675d4d")
    .font("Helvetica")
    .fontSize(13)
    .text(boundedText(input.edition, 160), PAGE_MARGIN, 126, { width: width - PAGE_MARGIN * 2 });

  const summary = [
    ["Run", input.runId],
    ["Mode", input.mode],
    ...(input.evidenceTier ? [["Evidence tier", input.evidenceTier]] : []),
    ["Commit", input.commit],
    ["Captures", input.captureCount],
    ["Routes", input.routeCount],
    ["Image pages", input.pages.length],
    ["Unexpected diagnostics", input.unexpectedDiagnostics]
  ];
  let y = 190;
  for (const [label, value] of summary) {
    document
      .fillColor("#675d4d")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(boundedText(label, 60).toUpperCase(), PAGE_MARGIN, y, { width: 180, lineBreak: false });
    document
      .fillColor("#17140f")
      .font("Helvetica")
      .fontSize(11)
      .text(boundedText(value, 220), PAGE_MARGIN + 190, y, { width: width - PAGE_MARGIN * 2 - 190 });
    y += 34;
  }

  if (input.redacted) {
    document
      .roundedRect(PAGE_MARGIN, y + 20, width - PAGE_MARGIN * 2, 66, 8)
      .fill("#fff8ed");
    document
      .fillColor("#694325")
      .font("Helvetica")
      .fontSize(11)
      .text(
        "Shareable redacted edition. Private routes, authenticated captures, account details, source filenames, and customer references are excluded.",
        PAGE_MARGIN + 18,
        y + 42,
        { width: width - PAGE_MARGIN * 2 - 36 }
      );
  }
}

async function addCapturePages(document: PDFKit.PDFDocument, input: PdfAtlasInput) {
  const capturesOutline = document.outline.addItem("Captures", { expanded: false });
  let previousCaptureKey = "";
  const totalPages = input.pages.length + 1;

  for (const [index, page] of input.pages.entries()) {
    document.addPage();
    if (page.captureKey !== previousCaptureKey) {
      capturesOutline.addItem(boundedText(`${page.route} - ${page.state}`, 180));
      previousCaptureKey = page.captureKey;
    }

    const width = document.page.width;
    const height = document.page.height;
    document.rect(0, 0, width, height).fill("#ffffff");
    document
      .fillColor("#17140f")
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(boundedText(page.route, 220), PAGE_MARGIN, 22, { width: width - PAGE_MARGIN * 2, lineBreak: false });
    document
      .fillColor("#675d4d")
      .font("Helvetica")
      .fontSize(9)
      .text(
        boundedText(`${page.state} | ${page.auth} | ${page.theme} | ${page.viewport} | HTTP ${page.status}`, 260),
        PAGE_MARGIN,
        44,
        { width: width - PAGE_MARGIN * 2, lineBreak: false }
      );
    document
      .fillColor("#675d4d")
      .fontSize(8)
      .text(
        boundedText(`${page.assetLabel} | slice ${page.sliceIndex} of ${page.sliceCount}`, 260),
        PAGE_MARGIN,
        59,
        { width: width - PAGE_MARGIN * 2, lineBreak: false }
      );

    const imageY = HEADER_HEIGHT;
    const imageHeight = height - imageY - FOOTER_HEIGHT - PAGE_MARGIN;
    const imageWidth = width - PAGE_MARGIN * 2;
    const image = await fs.readFile(page.imageFile);
    document.image(image, PAGE_MARGIN, imageY, {
      fit: [imageWidth, imageHeight],
      align: "center",
      valign: "center"
    });
    document
      .lineWidth(0.5)
      .strokeColor("#c8bda9")
      .rect(PAGE_MARGIN, imageY, imageWidth, imageHeight)
      .stroke();
    document
      .fillColor("#675d4d")
      .font("Helvetica")
      .fontSize(8)
      .text(`Page ${index + 2} of ${totalPages}`, PAGE_MARGIN, height - 20, {
        width: imageWidth,
        align: "right",
        lineBreak: false
      });
  }
}

export async function createPdfAtlas(input: PdfAtlasInput) {
  await ensureDirectory(path.dirname(input.outputFile));
  const temporaryFile = `${input.outputFile}.tmp-${process.pid}-${randomUUID()}`;
  const createdAt = documentDate(input.createdAt);
  const document = new PDFDocument({
    autoFirstPage: false,
    bufferPages: false,
    compress: false,
    size: "A3",
    layout: "landscape",
    margin: 0,
    info: {
      Title: boundedText(input.title, 160),
      Author: "Beaman Woodworks",
      Subject: boundedText(input.edition, 160),
      Keywords: "Beaman Woodworks, visual QA, browser archive",
      CreationDate: createdAt,
      ModDate: createdAt
    }
  });
  const output = createWriteStream(temporaryFile, { flags: "wx", mode: 0o600 });
  const writing = pipeline(document, output);

  try {
    addCover(document, input);
    await addCapturePages(document, input);
    document.end();
    await writing;
    await fs.rename(temporaryFile, input.outputFile);
    await fs.chmod(input.outputFile, 0o600).catch(() => undefined);
  } catch (error) {
    document.destroy(error instanceof Error ? error : new Error(String(error)));
    output.destroy();
    await writing.catch(() => undefined);
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
}
