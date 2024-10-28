'use server'

interface MessageData {
  from: string
  phoneNumber: string
  message: string
}

export async function sendSms({ from, phoneNumber, message }: MessageData) {
  console.log('Starting SMS send attempt:', { from, phoneNumber, messageLength: message.length })
  
  const username = process.env.ELKS_API_USERNAME
  const password = process.env.ELKS_API_PASSWORD

  if (!username || !password) {
    console.error('API Credentials missing:', { 
      hasUsername: !!username, 
      hasPassword: !!password 
    })
    throw new Error('Missing API credentials')
  }

  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
      },
      body: new URLSearchParams({
        from,
        to: phoneNumber,
        message
      })
    })

    const responseData = await response.json()
    
    if (!response.ok) {
      console.error('API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        responseData
      })
      throw new Error(`Failed to send SMS: ${response.statusText}`)
    }

    console.log('SMS sent successfully:', responseData)
    return responseData

  } catch (error) {
    console.error('SMS send error:', error)
    throw error instanceof Error 
      ? error 
      : new Error('Failed to send SMS: Unknown error')
  }
}