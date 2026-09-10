import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import type {
  IPdfService,
  PdfDocumentData,
  PdfGenerateOptions,
  PdfContentItem,
} from "./types";

export class PdfService implements IPdfService {
  async generatePdf(
    documentData: PdfDocumentData,
    options?: PdfGenerateOptions,
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    // Document Metadata
    pdfDoc.setTitle(documentData.title);
    if (documentData.author) pdfDoc.setAuthor(documentData.author);
    if (documentData.subject) pdfDoc.setSubject(documentData.subject);
    if (documentData.keywords) pdfDoc.setKeywords(documentData.keywords);
    pdfDoc.setProducer("Planning Infirmier PDF Engine");
    pdfDoc.setCreationDate(new Date());

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page dimension resolution
    let baseDimensions: [number, number] = PageSizes.A4;
    if (options?.pageSize === "LETTER") {
      baseDimensions = PageSizes.Letter;
    }

    const isLandscape = options?.orientation === "landscape";
    const pageWidth = isLandscape ? baseDimensions[1] : baseDimensions[0];
    const pageHeight = isLandscape ? baseDimensions[0] : baseDimensions[1];
    const margin = options?.margin ?? 40;
    const contentWidth = pageWidth - margin * 2;

    const pages = documentData.pages && documentData.pages.length > 0
      ? documentData.pages
      : [{ items: [{ type: "text", text: documentData.title, bold: true, size: 18 } as PdfContentItem] }];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageData = pages[pageIdx];
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      let currentY = pageHeight - margin;

      // Header if defined
      if (documentData.headerText) {
        page.drawText(documentData.headerText, {
          x: margin,
          y: currentY,
          size: 9,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        });
        currentY -= 20;
      }

      // Page Title
      if (pageData.title) {
        page.drawText(pageData.title, {
          x: margin,
          y: currentY,
          size: 16,
          font: boldFont,
          color: rgb(0.1, 0.1, 0.1),
        });
        currentY -= 24;
      }

      // Draw Items
      for (const item of pageData.items) {
        if (currentY < margin + 40) {
          // Bottom margin safety limit
          break;
        }

        switch (item.type) {
          case "heading": {
            const size = item.level === 1 ? 16 : item.level === 2 ? 14 : 12;
            const itemColor = item.color ? rgb(item.color.r, item.color.g, item.color.b) : rgb(0.1, 0.1, 0.1);
            page.drawText(item.text, {
              x: margin,
              y: currentY,
              size,
              font: boldFont,
              color: itemColor,
            });
            currentY -= size + (item.spacingAfter ?? 12);
            break;
          }

          case "text": {
            const size = item.size ?? 11;
            const font = item.bold ? boldFont : regularFont;
            const itemColor = item.color ? rgb(item.color.r, item.color.g, item.color.b) : rgb(0.2, 0.2, 0.2);
            page.drawText(item.text, {
              x: margin,
              y: currentY,
              size,
              font,
              color: itemColor,
            });
            currentY -= size + (item.spacingAfter ?? 8);
            break;
          }

          case "key-value": {
            const keyText = `${item.key}: `;
            const keyWidth = (item.keyBold ? boldFont : regularFont).widthOfTextAtSize(keyText, 10);
            
            page.drawText(keyText, {
              x: margin,
              y: currentY,
              size: 10,
              font: item.keyBold ? boldFont : regularFont,
              color: rgb(0.1, 0.1, 0.1),
            });

            page.drawText(item.value, {
              x: margin + keyWidth,
              y: currentY,
              size: 10,
              font: regularFont,
              color: rgb(0.25, 0.25, 0.25),
            });

            currentY -= 16;
            break;
          }

          case "divider": {
            const thickness = item.thickness ?? 1;
            const divColor = item.color ? rgb(item.color.r, item.color.g, item.color.b) : rgb(0.8, 0.8, 0.8);
            page.drawLine({
              start: { x: margin, y: currentY },
              end: { x: margin + contentWidth, y: currentY },
              thickness,
              color: divColor,
            });
            currentY -= thickness + (item.spacingAfter ?? 12);
            break;
          }

          case "table": {
            const cols = item.headers.length;
            const colWidth = contentWidth / cols;
            const rowHeight = 18;

            // Draw header
            for (let i = 0; i < cols; i++) {
              page.drawText(item.headers[i], {
                x: margin + i * colWidth + 4,
                y: currentY,
                size: 10,
                font: boldFont,
                color: rgb(0.1, 0.1, 0.1),
              });
            }
            currentY -= rowHeight;

            // Draw header bottom line
            page.drawLine({
              start: { x: margin, y: currentY + 4 },
              end: { x: margin + contentWidth, y: currentY + 4 },
              thickness: 1,
              color: rgb(0.7, 0.7, 0.7),
            });

            // Draw rows
            for (const row of item.rows) {
              if (currentY < margin + 20) break;
              for (let c = 0; c < Math.min(row.length, cols); c++) {
                page.drawText(row[c], {
                  x: margin + c * colWidth + 4,
                  y: currentY,
                  size: 9,
                  font: regularFont,
                  color: rgb(0.2, 0.2, 0.2),
                });
              }
              currentY -= rowHeight;
            }

            currentY -= item.spacingAfter ?? 12;
            break;
          }
        }
      }

      // Footer if defined
      const pageFooter = documentData.footerText
        ? `${documentData.footerText} | Page ${pageIdx + 1} of ${pages.length}`
        : `Page ${pageIdx + 1} of ${pages.length}`;

      page.drawText(pageFooter, {
        x: margin,
        y: margin - 15,
        size: 9,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    const bytes = await pdfDoc.save();
    return bytes;
  }

  isValidPdf(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 5) return false;
    // PDF Magic Header: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    return (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
}

/**
 * Factory constructor helper for PDF service.
 */
export function createPdfService(): IPdfService {
  return new PdfService();
}
