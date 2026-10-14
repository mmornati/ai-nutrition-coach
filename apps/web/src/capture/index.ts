// Phase 5 capture. Phase 6 (AI) imports the sanitizer and the digest/permit from here and the
// food-group classifier from `../catalog`; this directory imports nothing from `src/ai`.
export {
  detectPhotoFormat,
  sanitizePhotoForUpload,
  stripJpegMetadata,
  stripPngMetadata,
  stripWebpMetadata,
  PHOTO_MIME,
  type PhotoFormat,
  type PhotoSanitizeResult,
  type UnsendablePhotoReason,
} from './photo-sanitizer';
export { photoDigest, PhotoUploadPermit } from './photo-digest';
export {
  downscalePhoto,
  fitWithin,
  createBrowserImageCodec,
  MAX_PHOTO_EDGE,
  PHOTO_JPEG_QUALITY,
  type ImageCodec,
} from './photo-downscale';
export {
  createFilePhotoCapture,
  pickPhotoFile,
  type PhotoCapture as PhotoCapturePort,
  type PhotoSource,
} from './photo-capture';
export { runPhotoFlow, type PhotoFlowDeps, type PhotoFlowState } from './photo-flow';
export { closestMatches, MAX_CLOSEST_MATCHES } from './closest-matches';
export { usePhotoFlow, type UsePhotoFlowDeps } from './usePhotoFlow';
export { PhotoCapture } from './PhotoCapture';
export { CameraNotice } from './CameraNotice';
