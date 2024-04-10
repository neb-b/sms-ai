import * as db from './db'
import { ai } from './ai'
import { sendSMS } from './twilio'

export class Cron {
  constructor() {
    console.log('Reminder job started')
    runReminders()
  }
}

const FIVE_MINUTES = 1000 * 60 * 5

async function runReminders() {
  try {
    const activeReminders = await db.getActiveReminders()
    activeReminders.forEach(async (reminder) => {
      const user = await db.getUserById(reminder.user_id)

      if (!user) {
        return
      }

      const event = await db.getEvent(reminder.event_id)

      const message = `Reminder: ${reminder.date} - ${event.name}`
      const previousMessagesFromUser = await db.getMessages(user.id)
      const improvedMessage = await ai.complete({
        userId: user.id,
        message: `
            Improve this message to be more readable and friendly, keep it short and concise though:
            ${message}`,
        messages: previousMessagesFromUser.map((message) => {
          return {
            role: message.role,
            content: message.content,
          }
        }),
      })

      await await db.createMessages([
        {
          role: 'system',
          content: improvedMessage,
          user_id: user.id,
        },
      ])

      await sendSMS({
        body: improvedMessage,
        to: user.phone_number,
      })

      await db.updateReminder({
        id: reminder.id,
        reminder_sent: true,
      })
    })
  } catch (e) {}

  await new Promise((resolve) => setTimeout(resolve, FIVE_MINUTES))
  return await runReminders()
}
