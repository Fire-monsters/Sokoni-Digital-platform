export class PesapalRequestError extends Error {
  readonly code = "PESAPAL_REQUEST_FAILED";

  constructor(
    message: string,
    readonly ambiguous: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PesapalRequestError";
  }
}
