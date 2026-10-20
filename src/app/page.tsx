'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { sendSms } from './sendSms'
import {
  estimateSmsSegments,
  MESSAGE_LIMIT,
  validateMessageInput,
} from '@/lib/validation'

type Status = { type: 'idle' } | { type: 'success'; detail: string }

export default function MessageForm() {
  const [from, setFrom] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  // Live estimate of how the message will be segmented.
  const { segments, chars, encoding } = useMemo(() => estimateSmsSegments(message), [message])
  const overLimit = chars > MESSAGE_LIMIT

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    // Reset any previous outcome before retrying.
    setStatus({ type: 'idle' })
    setError('')

    // Fast fail on the client so the user gets instant feedback. The server
    // validates again — never rely on this alone.
    try {
      validateMessageInput({ from, phoneNumber, message })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte validera formuläret.')
      return
    }

    setIsSubmitting(true)
    try {
      await sendSms({ from, phoneNumber, message })
      // `segments` from the memo above reflects the exact message that was sent.
      setStatus({ type: 'success', detail: `${segments} SMS-segment skickat` })
      // Reset for the next message.
      setFrom('')
      setPhoneNumber('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skicka meddelandet.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Skicka ett SMS</h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="from">Från (avsändare)</Label>
          <Input
            type="text"
            id="from"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Ditt namn eller ID"
            disabled={isSubmitting}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Telefonnummer</Label>
          <Input
            type="tel"
            inputMode="tel"
            id="phoneNumber"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+46701234567"
            disabled={isSubmitting}
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Meddelande</Label>
          <Textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Skriv ditt meddelande här…"
            disabled={isSubmitting}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={overLimit ? 'text-destructive' : undefined}>
              {chars}/{MESSAGE_LIMIT} tecken
            </span>
            <span>
              {segments > 0 ? `${segments} segment (${encoding})` : '—'}
            </span>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {isSubmitting ? 'Skickar…' : 'Skicka meddelande'}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Misslyckades</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status.type === 'success' && (
        <Alert variant="default" className="mt-4">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <strong>Meddelandet skickades!</strong> {status.detail}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
