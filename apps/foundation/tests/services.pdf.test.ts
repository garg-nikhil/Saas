import { describe, it, expect } from "vitest";
import { PdfService, createPdfService, type PdfDocumentData } from "../app/services/pdf";

describe("Milestone 4B — PDF Generation Service", () => {
  it("generates a valid PDF with correct magic bytes and non-zero length", async () => {
    const service = createPdfService();

    const docData: PdfDocumentData = {
      title: "Quarterly Financial Statement",
      author: "Planning Infirmier Financials",
      subject: "Q3 Summary",
      headerText: "CONFIDENTIAL — FOR INTERNAL USE ONLY",
      footerText: "Planning Infirmier Platform",
      pages: [
        {
          title: "Executive Summary",
          items: [
            { type: "heading", text: "1. Revenue Growth", level: 1 },
            { type: "text", text: "MRR increased by 28% quarter-over-quarter.", size: 11 },
            { type: "divider", thickness: 1 },
            { type: "key-value", key: "Gross Margin", value: "84.5%", keyBold: true },
            { type: "key-value", key: "Customer Churn", value: "1.2%" },
            {
              type: "table",
              headers: ["Month", "New Users", "Revenue"],
              rows: [
                ["July", "420", "$42,000"],
                ["August", "510", "$51,000"],
                ["September", "640", "$64,000"],
              ],
            },
          ],
        },
      ],
    };

    const pdfBytes = await service.generatePdf(docData, { pageSize: "A4", orientation: "portrait" });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(500);

    // Validate PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    expect(service.isValidPdf(pdfBytes)).toBe(true);

    const magicString = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(magicString).toBe("%PDF-");
  });

  it("handles multi-page documents and landscape orientation", async () => {
    const service = new PdfService();

    const multiPageDoc: PdfDocumentData = {
      title: "Multi-Page Report",
      pages: [
        {
          title: "Page 1 - Overview",
          items: [{ type: "text", text: "Introductory content on page 1." }],
        },
        {
          title: "Page 2 - Detailed Analysis",
          items: [{ type: "text", text: "Secondary breakdown on page 2." }],
        },
      ],
    };

    const bytes = await service.generatePdf(multiPageDoc, { pageSize: "LETTER", orientation: "landscape" });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(service.isValidPdf(bytes)).toBe(true);
  });

  it("validates invalid bytes as not a PDF", () => {
    const service = new PdfService();
    expect(service.isValidPdf(new Uint8Array([0, 1, 2, 3]))).toBe(false);
    expect(service.isValidPdf(new Uint8Array([]))).toBe(false);
    expect(service.isValidPdf(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39]))).toBe(false); // GIF header
  });
});
