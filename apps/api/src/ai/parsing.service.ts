import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as mammoth from "mammoth";

export const MAX_CV_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export type ParsedDocument = {
  text: string;
  pageCount: number | null;
  mimeType: string;
  fileName: string;
  characters: number;
};

@Injectable()
export class ParsingService {
  private readonly logger = new Logger(ParsingService.name);

  async extract(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }): Promise<ParsedDocument> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Fichier vide ou illisible.");
    }
    if (file.size > MAX_CV_BYTES) {
      throw new BadRequestException("Fichier trop volumineux (8 Mo maximum).");
    }

    const mimeType = this.resolveMimeType(file.mimetype, file.originalname);
    const { text, pageCount } = await this.extractByType(mimeType, file.buffer);
    const cleaned = normalizeWhitespace(text);

    if (cleaned.length < 40) {
      throw new BadRequestException(
        "Aucun texte exploitable extrait. Si votre CV est un PDF scanné (image), exportez-le en PDF texte ou téléversez un .docx.",
      );
    }

    return {
      text: cleaned,
      pageCount,
      mimeType,
      fileName: file.originalname,
      characters: cleaned.length,
    };
  }

  private async extractByType(mimeType: string, buffer: Buffer) {
    switch (mimeType) {
      case "application/pdf":
        return this.extractPdf(buffer);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return this.extractDocx(buffer);
      default:
        return { text: buffer.toString("utf8"), pageCount: null };
    }
  }

  private async extractPdf(buffer: Buffer) {
    let parser: { getText: () => Promise<{ text?: string; total?: number; pages?: unknown[] }>; destroy: () => Promise<void> } | null =
      null;
    try {
      // pdf-parse v2 is class-based (PDFParse). Copy the buffer: the library
      // transfers ownership of typed arrays to its worker thread.
      const { PDFParse } = await import("pdf-parse");
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      return {
        text: result.text ?? "",
        pageCount: result.total ?? result.pages?.length ?? null,
      };
    } catch (error) {
      this.logger.warn(`PDF parsing failed: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException("PDF illisible ou protégé par mot de passe.");
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  private async extractDocx(buffer: Buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value ?? "", pageCount: null };
    } catch (error) {
      this.logger.warn(`DOCX parsing failed: ${error instanceof Error ? error.message : error}`);
      throw new BadRequestException("Document Word illisible.");
    }
  }

  private resolveMimeType(mimetype: string, fileName: string) {
    if (ACCEPTED_CV_MIME_TYPES.includes(mimetype)) return mimetype;

    // Browsers and proxies sometimes send octet-stream, so fall back to suffix.
    const extension = fileName.toLowerCase().split(".").pop();
    const byExtension: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
    };
    const resolved = extension ? byExtension[extension] : undefined;
    if (resolved) return resolved;

    if (extension === "doc") {
      throw new BadRequestException(
        "Le format .doc (Word 97-2003) n'est pas pris en charge. Enregistrez votre CV en .docx ou .pdf.",
      );
    }
    throw new BadRequestException("Format non pris en charge. Utilisez PDF, DOCX ou TXT.");
  }
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
