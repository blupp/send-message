// Shared input validation. Runs on both the client (fast fail) and the server
// (authoritative, never trust the client). Kept dependency-free on purpose so
// the build stays self-contained; swap for `zod` (see Nivå 3) later.

export interface MessageInput {
  from: string
  phoneNumber: string
  message: string
}

// Thrown whenever input fails validation. Caught on the server and mapped to a
// user-facing message in the server action.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// 46elks "from" is a free-form alphanumeric sender ID. We keep lenient but
// bounded (a typical sender ID is 1–11 characters).
const SENDER_RE = /^[a-zA-Z0-9]{1,11}$/
// Swedish number normalized to +46 followed by 9–11 digits (~10–12 total), which
// covers most mobile and landline numbers.
const SWEDISH_PHONE_RE = /^\+46\d{9,11}$/
// Reasonable upper bound to avoid abuse via multi-part concatenation.
const MAX_MESSAGE_LENGTH = 1200

/**
 * Validate a full message payload.
 *
 * @throws {ValidationError} with a human-readable message on the first failure.
 */
export function validateMessageInput(input: MessageInput): void {
  const { from, phoneNumber, message } = input

  if (!from || !from.trim()) {
    throw new ValidationError('Från-fältet är tomt. Fyll i en avsändare.')
  }
  if (!SENDER_RE.test(from)) {
    throw new ValidationError('Från får bara innehålla bokstäger och siffror (1–11 tecken).')
  }

  if (!phoneNumber || !phoneNumber.trim()) {
    throw new ValidationError('Telefonnummer saknas.')
  }
  if (!SWEDISH_PHONE_RE.test(phoneNumber)) {
    throw new ValidationError('Ange ett giltigt svenskt nummer, t.ex. +46701234567.')
  }

  if (!message || !message.trim()) {
    throw new ValidationError('Meddelandet är tomt.')
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Meddelandet är för långt (max ${MAX_MESSAGE_LENGTH} tecken).`)
  }
}

/**
 * Estimate how an SMS is segmented. The estimate is approximate (46elks' own
 * billing is authoritative) but good enough to warn the user before sending.
 *
 * GSM-7: 160 chars in one segment, 153 per segment when concatenated.
 * UCS-2: 70 chars in one segment, 67 per segment when concatenated (used when the
 * text contains characters outside the GSM-7 set, e.g. emoji or most accented
 * letters used in extended form).
 */
export function estimateSmsSegments(text: string): {
  segments: number
  chars: number
  encoding: 'GSM-7' | 'UCS-2'
} {
  const chars = text.length
  // Anything outside the print-able + extended GSM-7 control range forces UCS-2.
  const isGsm7 = /^[\x00-\x9F\xA1\xAC\xAD\xB5\xBE\xD7\xF7]*$/.test(text)

  const single = isGsm7 ? 160 : 70
  const multi = isGsm7 ? 153 : 67

  let segments = 0
  if (chars > 0) {
    segments = chars <= single ? 1 : Math.ceil(chars / multi)
  }

  return { segments, chars, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' }
}

export const MESSAGE_LIMIT = MAX_MESSAGE_LENGTH
