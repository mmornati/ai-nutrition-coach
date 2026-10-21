// Phase 5 capture. Phase 6 (AI) imports the sanitizer and the digest from here and the food-group
// classifier from `../catalog`. The one upload permit and consent-gated rung live in `src/ai`;
// `runPhotoFlow` is the one consent orchestrator.
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
export { photoDigest } from './photo-digest';
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
export {
  closestMatches,
  enrichRecognition,
  namesAgree,
  MAX_CLOSEST_MATCHES,
  NUTRIENT_MATCH_MIN_CONFIDENCE,
} from './closest-matches';
export { usePhotoFlow, type UsePhotoFlowDeps } from './usePhotoFlow';
export { PhotoCapture } from './PhotoCapture';
export { CameraNotice } from './CameraNotice';
export {
  describeLocally,
  searchTermOf,
  splitDescription,
  MAX_DESCRIBED_PIECES,
  type LocalDescription,
} from './describe-local';
export {
  VoiceRecorder,
  browserVoiceEnv,
  pickRecorderMime,
  voiceRecordingSupported,
  MAX_RECORDING_MS,
  RECORDER_MIME_CANDIDATES,
  type RecorderLike,
  type RecorderStart,
  type RecorderStop,
  type VoiceEnv,
} from './voice-recorder';
export {
  bestMatch,
  gramsOfLine,
  isLiquid,
  MAX_RECIPE_TEXT_LENGTH,
  parseIngredientLine,
  parseRecipeText,
  prefillFromAi,
  prefillFromParsed,
  recipeFromText,
  servingsOf,
  type AiReadRecipe,
  type ParsedIngredientLine,
  type ParsedRecipeText,
  type RecipePrefill,
} from './recipe-paste';
