import { ListingHttpError } from "./listings.errors.js";

export function assertListingImagePaths(
  expectedPrefix: string,
  originalPath: string,
  thumbnailPath: string,
): void {
  if (!originalPath.startsWith(expectedPrefix) || !thumbnailPath.startsWith(expectedPrefix)) {
    throw new ListingHttpError(400, "BAD_REQUEST", "Upload paths do not belong to this listing.");
  }
}
