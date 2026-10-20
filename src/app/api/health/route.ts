import { hasElksCredentials } from '@/lib/env'

// A minimal readiness probe. Wire this into your uptime monitor / Vercel health
// check so a deploy that is missing 46elks credentials fails loudly (HTTP 503)
// instead of silently rejecting every send.
export const runtime = 'nodejs'

export function GET() {
  const smsConfigured = hasElksCredentials()
  return Response.json(
    { service: 'send-message', smsConfigured },
    { status: smsConfigured ? 200 : 503 },
  )
}
