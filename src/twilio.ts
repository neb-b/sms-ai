import Twilio from 'twilio'
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

const twilio = Twilio(accountSid, authToken)

export const sendSMS = async ({ to, body }: { to: string; body: string }) => {
  console.log('new text: ', { to, body })

  if (process.env.NODE_ENV === 'production') {
    return new Promise((resolve) => {
      resolve(true)
    })
  }

  return twilio.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  })
}

export type TwilioMessage = {
  ToCountry: string
  ToState: string
  SmsMessageSid: string
  NumMedia: string
  ToCity: string
  FromZip: string
  SmsSid: string
  FromState: string
  SmsStatus: string
  FromCity: string
  Body: string
  FromCountry: string
  To: string
  ToZip: string
  NumSegments: string
  MessageSid: string
  AccountSid: string
  From: string
  ApiVersion: string
}
