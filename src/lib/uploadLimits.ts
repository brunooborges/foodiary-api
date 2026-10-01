type Env = Record<string, string | undefined>;

export type UploadInputType = 'audio' | 'picture';

const MEGABYTE = 1024 * 1024;

const DEFAULT_MAX_BYTES: Record<UploadInputType, number> = {
  audio: 5 * MEGABYTE,
  picture: 8 * MEGABYTE,
};

const ENV_VARIABLE: Record<UploadInputType, string> = {
  audio: 'MAX_AUDIO_FILE_BYTES',
  picture: 'MAX_IMAGE_FILE_BYTES',
};

// An invalid override falls back to the default: a typo must never turn the cap off.
export function getMaxFileBytes(inputType: UploadInputType, env: Env = process.env): number {
  const configured = Number(env[ENV_VARIABLE[inputType]]);

  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES[inputType];
}
