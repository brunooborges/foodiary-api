export const MAX_USER_TEXT_LENGTH = 2_000;

// Control characters (C0/C1), line/paragraph separators and bidirectional overrides/isolates. The broader "format"
// class is avoided on purpose: it contains the zero-width joiner that compound emoji depend on.
const CONTROL_CHARACTERS = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/gu;
const ANGLE_BRACKETS = /[<>]/g;

function toSingleLine(text: string): string {
  return text.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
}

// Cleans text produced by a model before it is stored or shown to the user.
export function stripControlCharacters(text: string): string {
  return toSingleLine(text);
}

// Cleans text written or spoken by the user before it is placed inside a prompt. Angle brackets are removed so the
// text can never open or close the delimiter tags that mark it as data.
export function sanitizeUserText(text: string): string {
  const singleLine = toSingleLine(text.replace(ANGLE_BRACKETS, ' '));

  return Array.from(singleLine).slice(0, MAX_USER_TEXT_LENGTH).join('').trimEnd();
}
