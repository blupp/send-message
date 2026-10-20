import { z } from 'zod'

// Shared input validation. Used by the client as a fast-fail and, more
// importantly, by the server as the authoritative check — never trust the
// client. Kept on `zod` so schema and inference live in one place.

export interface MessageInput {
  from: string
  phoneNumber: string
  message: string
}

// 46elks alphanumeric sender IDs are 3–11 characters and must ALSO be
// registered/approved in your 46elks account — an approval we cannot verify
// offline, so we only enforce the format here.
const SENDER_ID_RE = /^[A-Za-z0-9]{3,11}$/
// Swedish numbers normalized to +46 followed by 9–11 digits (typical mobile /
// landline ranges).
const SWEDISH_PHONE_RE = /^\+46\d{9,11}$/

// Reasonable upper bound to discourage abuse via multi-part concatenation.
export const MESSAGE_LIMIT = 1200

export const messageInputSchema = z
  .object({
    from: z.string().optional().default(''),
    phoneNumber: z.string().optional().default(''),
    message: z.string().optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (!val.from.trim()) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Från-fältet är tomt. Fyll i en avsändare.' })
    } else if (!SENDER_ID_RE.test(val.from.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Från (avsändare) får innehålla 3–11 bokstäler eller siffror. Den registrerade avsändaren ska också finnas hos 46elks.',
      })
    }

    if (!val.phoneNumber.trim()) {
      ctx.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Telefonnummer saknas.' })
    } else if (!SWEDISH_PHONE_RE.test(val.phoneNumber.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['phoneNumber'],
        message: 'Ange ett giltigt svenskt nummer, t.ex. +46701234567.',
      })
    }

    if (!val.message.trim()) {
      ctx.addIssue({ code: 'custom', path: ['message'], message: 'Meddelandet är tomt.' })
    } else if (val.message.length > MESSAGE_LIMIT) {
      ctx.addIssue({
        code: 'custom',
        path: ['message'],
        message: `Meddelandet är för långt (max ${MESSAGE_LIMIT} tecken).`,
      })
    }
  })

export type MessageInputSchema = typeof messageInputSchema

// Thrown when input fails validation. Caught on the server and surfaced to the
// user unchanged.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate and normalize a message payload.
 *
 * @throws {ValidationError} with a user-facing message on the first problem.
 * @returns a cleaned, trimmed MessageInput.
 */
export function validateMessageInput(input: unknown): MessageInput {
  const result = messageInputSchema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Ogiltiga uppgifter i formuläret.')
  }

  return {
    from: result.data.from.trim(),
    phoneNumber: result.data.phoneNumber.trim(),
    message: result.data.message,
  }
}

/**
 * Estimate how an SMS is segmented. Approximate (46elks' own billing is
 * authoritative), but good enough to warn the user before sending.
 *
 * GSM-7: 160 chars single, 153 per part when concatenated.
 * UCS-2: 70 chars single, 67 per part when concatenated — used for text that
 * contains characters outside the printable/extended GSM-7 set.
 */
export function estimateSmsSegments(text: string): {
  segments: number
  chars: number
  encoding: 'GSM-7' | 'UCS-2'
} {
  const chars = text.length
  const isGsm7 = /^[\x00-\x9F\xA1\xAC\xAD\xB5\xBE\xD7\xF7]*$/.test(text)

  const single = isGsm7 ? 160 : 70
  const multi = isGsm7 ? 153 : 67

  const segments = chars > 0 ? (chars <= single ? 1 : Math.ceil(chars / multi)) : 0

  return { segments, chars, encoding: isGsm7 ? 'GSM-7' : 'UCS-2' }
}
