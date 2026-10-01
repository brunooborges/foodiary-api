import { describe, expect, it } from 'vitest';

import { getMaxFileBytes } from './uploadLimits';

const MEGABYTE = 1024 * 1024;

describe('getMaxFileBytes', () => {
  it('defaults to 5 MB for audio and 8 MB for pictures', () => {
    expect(getMaxFileBytes('audio', {})).toBe(5 * MEGABYTE);
    expect(getMaxFileBytes('picture', {})).toBe(8 * MEGABYTE);
  });

  it('can be overridden through the environment', () => {
    // Arrange
    const env = { MAX_AUDIO_FILE_BYTES: '1000', MAX_IMAGE_FILE_BYTES: '2000' };

    // Act & Assert
    expect(getMaxFileBytes('audio', env)).toBe(1000);
    expect(getMaxFileBytes('picture', env)).toBe(2000);
  });

  it('ignores invalid overrides instead of disabling the cap', () => {
    expect(getMaxFileBytes('audio', { MAX_AUDIO_FILE_BYTES: '' })).toBe(5 * MEGABYTE);
    expect(getMaxFileBytes('audio', { MAX_AUDIO_FILE_BYTES: 'abc' })).toBe(5 * MEGABYTE);
    expect(getMaxFileBytes('audio', { MAX_AUDIO_FILE_BYTES: '0' })).toBe(5 * MEGABYTE);
    expect(getMaxFileBytes('audio', { MAX_AUDIO_FILE_BYTES: '-10' })).toBe(5 * MEGABYTE);
  });
});
