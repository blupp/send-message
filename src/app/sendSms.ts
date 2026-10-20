'use server'

import {
  type MessageInput,
  ValidationError,
  validateMessageInput,
} from '@/lib/validation'

// How long we are willing to wait for 46elks before bailing out.
const REQUEST_TIMEOUT_MS = 15_000

// 46elks returns a structured error body on failure; shape the bits we care about.
interface ElksErrorBody {
  error?: string
  error_code?: number
  error_description?: string
  request_url?: string
}

/**
 * Send an SMS through 46elks' a1/sms endpoint.
 *
 * This is a Next.js Server Action: it runs exclusively on the server, which is
 * why the 46elks credentials never reach the browser.
 *
 * @throws {ValidationError} when input is invalid (mapped to a user message).
 * @throws {Error} when the API call fails or times out.
 */
export async function sendSms(input: MessageInput) {
  const username = process.env.ELKS_API_USERNAME
  const password = process.env.ELKS_API_PASSWORD

  if (!username || !password) {
    console.error('Missing ELKS_API_USERNAME / ELKS_API_PASSWORD environment variables')
    throw new Error('Tjänsten är inte konfigurerad. Sakna ELKS-API-credentials.')
  }

  const { from, phoneNumber, message } = input

  // Authoritative validation — the client-side check is only a fast fail.
  try {
    validateMessageInput({ from, phoneNumber, message })
  } catch (err) {
    // Re-throw so the calling action can distinguish validation from API errors.
    if (err instanceof ValidationError) throw err
    throw new ValidationError('Ogiltiga uppgifter i formuläret.')
  }

  // Abort the request if 46elks takes forever, so the UI is never left hanging.
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
        from,
        to: phoneNumber,
        message,
      }),
      signal: controller.signal,
    })

    // 46elks returns text on some error shapes; parse defensively.
    const text = await response.text()
    let data: Record<string, unknown> | ElksErrorBody = {}
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      // Not JSON — leave data empty and fall back to the status message.
    }

    if (!response.ok) {
      const body = data as ElksErrorBody
      console.error('46elks request failed:', {
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
    // Preserve a ValidationError so the caller can show it verbatim.
    if (error instanceof ValidationError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Tidsgränsen för anropet uppstod. Försök igen.')
    }
    console.error('Unexpected error sending SMS', error)
    throw new Error('Ett oberoende fel uppstod vid skick. Försök igen.')
  } finally {
    clearTimeout(timer)
  }
}
