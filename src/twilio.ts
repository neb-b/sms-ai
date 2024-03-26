import twilio from 'twilio'
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

console.log('accountSid', accountSid)
console.log('authToekn', authToken)
export const client = twilio(accountSid, authToken)
