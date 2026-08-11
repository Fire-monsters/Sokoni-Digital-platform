export const qualityProofImagePolicy = {
  cachePolicy: "memory-disk" as const,
  thumbnailPriority: "low" as const,
  fullImageLoadsAutomatically: false,
  signedUrlStaleTimeMs: 4 * 60 * 1000,
};
