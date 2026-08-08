import type { CatalogueSort } from "@sokoni-digital/domain";

import type { CatalogueCursor } from "./catalogue.types.js";

export class InvalidCatalogueCursorError extends Error {
  constructor() {
    super("The catalogue cursor is invalid or does not match the selected sort.");
    this.name = "InvalidCatalogueCursorError";
  }
}

export function encodeCatalogueCursor(cursor: CatalogueCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCatalogueCursor(
  encodedCursor: string,
  expectedSort: CatalogueSort,
): CatalogueCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedCursor, "base64url").toString("utf8"),
    ) as Partial<CatalogueCursor>;

    if (
      parsed.sort !== expectedSort ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      (expectedSort === "latest"
        ? typeof parsed.value !== "string" || Number.isNaN(Date.parse(parsed.value))
        : typeof parsed.value !== "number" || !Number.isFinite(parsed.value))
    ) {
      throw new InvalidCatalogueCursorError();
    }

    return parsed as CatalogueCursor;
  } catch (error) {
    if (error instanceof InvalidCatalogueCursorError) {
      throw error;
    }

    throw new InvalidCatalogueCursorError();
  }
}
