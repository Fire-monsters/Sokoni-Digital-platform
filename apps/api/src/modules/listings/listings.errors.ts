export class ListingHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "ListingHttpError";
  }
}
