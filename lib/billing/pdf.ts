/**
 * Invoice PDF generation (ClipForge Phase 8).
 *
 * Renders a real PDF from a stored invoice record — no new
 * dependency: the file is assembled by hand (catalog, pages,
 * Helvetica text) so the deploy carries no extra weight. Amounts
 * stay integer minor units until formatting; the printable HTML
 * record remains available as a fallback.
 *
 * Currency note: most currencies use 2 minor digits; the small
 * zero-decimal set (JPY, KRW, VND, …) divides by 1 instead. An
 * unknown currency falls back to 2 digits and the code is printed
 * next to every amount, so a wrong assumption is visible.
 */

import type { InvoiceRow } from "./store";

/** Zero-decimal currencies (ISO 4217): minor unit equals major unit. */
const ZERO_DECIMAL = new Set([
  "JPY",
  "KRW",
  "VND",
  "CLP",
  "PYG",
  "XAF",
  "XOF",
  "XPF",
  "BIF",
  "DJF",
  "GNF",
  "ISK",
  "KMF",
  "RWF",
  "UGX",
]);

export function formatMinor(amountMinor: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const divisor = ZERO_DECIMAL.has(code) ? 1 : 100;
  const major = amountMinor / divisor;
  return `${major.toFixed(divisor === 1 ? 0 : 2)} ${code}`;
}

/** Escape a string for a PDF literal (ASCII only; the rest becomes ?). */
export function escapePdfText(value: string): string {
  return value
    .split("")
    .map((ch) => {
      if (ch === "\\") return "\\\\";
      if (ch === "(") return "\\(";
      if (ch === ")") return "\\)";
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) return "?";
      return ch;
    })
    .join("");
}

type PdfLine = { text: string; size: number; bold: boolean };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 16;
const MAX_LINES_PER_PAGE = 44;

/** Build the content stream for one page of lines. */
function pageContent(lines: PdfLine[]): string {
  const parts: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const font = line.bold ? "F2" : "F1";
    // Helvetica in a minimal PDF is effectively Latin-1/WinAnsi, and
    // the xref offsets below are byte offsets: sanitize to ASCII
    // first (em-dash becomes "-", anything else becomes "?") so
    // string length always equals byte length and nothing renders
    // garbled. Without this, a non-ASCII line silently shifts every
    // later xref entry.
    const ascii = line.text
      .replace(/—/g, "-")
      .replace(/[^\x20-\x7E]/g, "?");
    parts.push(
      `BT /${font} ${line.size} Tf ${MARGIN} ${y} Td (${escapePdfText(ascii)}) Tj ET`,
    );
    y -= LINE_HEIGHT;
  }
  return parts.join("\n");
}

/**
 * Assemble a minimal multi-page PDF. Objects: 1 catalog, 2 pages,
 * 3 font (regular), 4 font (bold), then per page a content object
 * and a page object. Offsets are computed, so the xref is valid.
 */
function assemblePdf(pages: PdfLine[][]): Uint8Array {
  const objects: string[] = [];
  // 1: catalog, 2: pages (kids filled below), 3/4: fonts.
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextId = 5;
  for (let i = 0; i < pages.length; i++) {
    contentObjectIds.push(nextId++);
    pageObjectIds.push(nextId++);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((lines, i) => {
    const stream = pageContent(lines);
    objects[contentObjectIds[i]] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageObjectIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
      `/Contents ${contentObjectIds[i]} 0 R >>`;
  });
  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let length = chunks[0].length;
  for (let id = 1; id < nextId; id++) {
    offsets[id] = length;
    const body = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    chunks.push(body);
    length += body.length;
  }
  const xrefAt = length;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(xref);
  return new TextEncoder().encode(chunks.join(""));
}

/** Lay out an invoice record as printable lines, paginated. */
export function invoicePdfLines(invoice: InvoiceRow): PdfLine[][] {
  const header: PdfLine[] = [
    { text: "ClipForge — Invoice", size: 20, bold: true },
    { text: `Invoice ${invoice.number}`, size: 13, bold: true },
    { text: `Date: ${invoice.created_at.slice(0, 10)}`, size: 11, bold: false },
    { text: `Status: ${invoice.status}`, size: 11, bold: false },
    { text: `Provider: ${invoice.provider}`, size: 11, bold: false },
    { text: "", size: 11, bold: false },
    { text: "Description | Qty | Amount", size: 11, bold: true },
  ];
  const itemLines: PdfLine[] = invoice.line_items.map((item) => ({
    text:
      `${item.description} | ${item.quantity} | ` +
      formatMinor(item.quantity * item.amount_minor, invoice.currency),
    size: 11,
    bold: false,
  }));
  const footer: PdfLine[] = [
    { text: "", size: 11, bold: false },
    {
      text: `Total: ${formatMinor(invoice.total_minor, invoice.currency)}`,
      size: 13,
      bold: true,
    },
  ];
  const all = [...header, ...itemLines, ...footer];
  const pages: PdfLine[][] = [];
  for (let i = 0; i < all.length; i += MAX_LINES_PER_PAGE) {
    pages.push(all.slice(i, i + MAX_LINES_PER_PAGE));
  }
  return pages.length > 0 ? pages : [[{ text: "Empty invoice", size: 11, bold: false }]];
}

/** Full PDF bytes for a stored invoice record. */
export function buildInvoicePdf(invoice: InvoiceRow): Uint8Array {
  return assemblePdf(invoicePdfLines(invoice));
}
