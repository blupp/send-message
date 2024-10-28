'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2 } from "lucide-react"
import { sendSms } from './sendSms'

export default function MessageForm() {
  const [from, setFrom] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Reset previous submission state
    setIsSubmitted(false)
    setError('')

    // Basic form validation
    if (!from || !phoneNumber || !message) {
      setError('Please fill in all fields.')
      return
    }

    if (!/^[a-zA-Z0-9]+$/.test(from)) {
      setError('From field should only contain alphanumeric characters.')
      return
    }

    if (!/^\+46\d{9,11}$/.test(phoneNumber)) {
      setError('Please enter a valid Swedish phone number (starting with +46 followed by 9-11 digits).')
      return
    }

    try {
      sendSms({ from, phoneNumber, message })
      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }

    // Here you would typically send the message data to a server
    console.log('Message sent:', { from, phoneNumber, message })
  }

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">Send a Message</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="from">From (Alphanumeric)</Label>
          <Input 
            type="text" 
            id="from" 
            value={from} 
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Your name" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input 
            type="tel" 
            id="phoneNumber" 
            value={phoneNumber} 
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="1234567890" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Message</Label>
          <Textarea 
            id="message" 
            value={message} 
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here" 
          />
        </div>

        <Button type="submit" className="w-full">Send Message</Button>
      </form>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isSubmitted && (
        <Alert variant="default" className="mt-4">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Message sent successfully!</AlertDescription>
        </Alert>
      )}
    </div>
  )
}