import Twilio from 'twilio'
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

const twilio = Twilio(accountSid, authToken)

export const sendSMS = async ({ to, body }: { to: string; body: string }) => {
  return new Promise((resolve) => {
    resolve(true)
  })

  console.log('sending message: ', { to, body })
  return twilio.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  })
}
