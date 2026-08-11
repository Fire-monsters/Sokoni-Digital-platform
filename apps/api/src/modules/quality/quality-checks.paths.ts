import { VendorOrderHttpError } from "../orders/vendor-orders.errors.js";

export function qualityImageBasePath(
  sellerId: string,
  orderId: string,
  qualityCheckId: string,
  imageId: string,
): string {
  return `${sellerId}/${orderId}/${qualityCheckId}/${imageId}`;
}

export function assertQualityImagePaths(
  expectedBase: string,
  originalPath: string,
  thumbnailPath: string,
): void {
  if (
    originalPath !== `${expectedBase}/original.jpg` ||
    thumbnailPath !== `${expectedBase}/thumbnail.jpg`
  ) {
    throw new VendorOrderHttpError(
      400,
      "BAD_REQUEST",
      "Upload paths do not belong to this quality image.",
    );
  }
}
