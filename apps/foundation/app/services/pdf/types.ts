/**
 * Reusable PDF Generation Service Contracts
 *
 * Provides a portable, serverless-compatible PDF generation boundary
 * with no filesystem or external process dependencies.
 */

export interface PdfTextItem {
  type: "text";
  text: string;
  size?: number;
  bold?: boolean;
  color?: { r: number; g: number; b: number };
  spacingAfter?: number;
}

export interface PdfHeadingItem {
  type: "heading";
  text: string;
  level?: 1 | 2 | 3;
  color?: { r: number; g: number; b: number };
  spacingAfter?: number;
}

export interface PdfDividerItem {
  type: "divider";
  color?: { r: number; g: number; b: number };
  thickness?: number;
  spacingAfter?: number;
}

export interface PdfKeyValueItem {
  type: "key-value";
  key: string;
  value: string;
  keyBold?: boolean;
}

export interface PdfTableItem {
  type: "table";
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  spacingAfter?: number;
}

export type PdfContentItem =
  | PdfTextItem
  | PdfHeadingItem
  | PdfDividerItem
  | PdfKeyValueItem
  | PdfTableItem;

export interface PdfPageContent {
  title?: string;
  items: PdfContentItem[];
}

export interface PdfDocumentData {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  headerText?: string;
  footerText?: string;
  pages: PdfPageContent[];
}

export interface PdfGenerateOptions {
  pageSize?: "A4" | "LETTER";
  orientation?: "portrait" | "landscape";
  margin?: number;
}

export interface IPdfService {
  generatePdf(document: PdfDocumentData, options?: PdfGenerateOptions): Promise<Uint8Array>;
  isValidPdf(bytes: Uint8Array): boolean;
}
