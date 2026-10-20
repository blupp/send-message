'use server'

import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { getElksCredentials } from '@/lib/env'
import { validateMessageInput, type MessageInput } from '@/lib/validation'
import { guardSend } from '@/lib/rateLimit'

// How long we are willing to wait for 46elks before bailing out.
const REQUEST_TIMEOUT_MS = 15_000

// 46elks returns a structured error body on failure; the fields we care about.
interface ElksErrorBody {
  error?: string
  error_description?: string
}

async function getCallerIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  return ip
}

// Content fingerprint so identical sends within a window are treated as one.
function contentKey(from: string, phoneNumber: string, message: string): string {
  return createHash('sha256')
    .update(`${from}\u0000${phoneNumber}\u0000${message}`)
    .digest('hex')
}

/**
 * Send an SMS through 46elks' a1/sms endpoint.
 *
 * A Next.js Server Action: it runs only on the server, so the 46elks
 * credentials never reach the browser. Guards, in order:
 *   1. authoritative input validation (client check is only a fast-fail)
 *   2. per-caller rate limit + duplicate suppression
 *   3. credential check (fails loud on misconfigured deploys)
 *   4. network request, with a timeout so the UI is never left hanging
 *
 * @throws {Error} with a user-facing Swedish message on any failure.
 */
export async function sendSms(input: MessageInput) {
  const ip = await getCallerIp()

  // 1. Authoritative validation — normalize before building the dedup key.
  let validated: MessageInput
  try {
    validated = validateMessageInput(input)
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error('Ogiltiga uppgifter i formuläret.')
  }

  // 2. Per-caller rate limit and duplicate suppression.
  const guard = guardSend(
    ip,
    contentKey(validated.from, validated.phoneNumber, validated.message),
  )
  if (!guard.ok) {
    throw new Error(guard.message)
  }

  // 3. Credentials.
  const { username, password } = getElksCredentials()

  // 4. Call 46elks with a timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      },
      body: new URLSearchParams({
        from: validated.from,
        to: validated.phoneNumber,
        message: validated.message,
      }),
      signal: controller.signal,
    })

    // 46elks returns text on some error shapes; parse defensively.
    const text = await response.text()
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      // Not JSON — keep data empty and fall back to the status message below.
    }

    if (!response.ok) {
      const body = data as unknown as ElksErrorBody
      console.error('46elks request failed', {
        status: response.status,
        statusText: response.statusText,
        body,
      })
      throw new Error(
        body?.error_description ||
          body?.error ||
          `Kunde inte skicka SMS (HTTP ${response.status}).`,
      )
    }

    console.info('SMS accepted', { status: response.status, ref: (data as { ref?: string })?.ref })
    return data
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tidsgränsen för anropet uppgick. Försök igen.')
    }
    // Re-throw unexpected errors without swallowing their cause.
    console.error('sendSms failed:', error)
    throw error instanceof Error ? error : new Error('Ett oberoende fel uppstod. Försök igen.')
  } finally {
    clearTimeout(timer)
  }
}
