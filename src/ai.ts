import OpenAI from 'openai'
import { createEvent, createReminder, searchForEvents } from './db'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ai {
  static async complete({
    user_id,
    messages = [],
    message,
  }: {
    user_id: number
    messages: { role: 'system' | 'user'; content: string }[]
    message: string
  }): Promise<string> {
    const runner = openai.beta.chat.completions.runTools({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `
              You are an SMS based AI assistant.
              All messages should be short and to the point.
              You can create events for the user.
              Only create events if the user specifically asks to remember or create an event/something.
              Another service will run a job that ensures the user is reminded of these events properly.
              this users "user_id" is "${user_id}"
              it is currently ${new Date().toISOString()}
            `,
        },
        ...messages,
        {
          role: 'user',
          content: message,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            function: create_event,
            description: 'Creates an event at a specified time in the future for the user',
            parse: JSON.parse,
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                timeFromNowInSeconds: { type: 'number' },
                user_id: { type: 'number' },
              },
            },
          },
        },
        {
          type: 'function',
          function: {
            function: search_for_events,
            description: 'Lets the user know if there is a scheduled event at a specic time in the future',
            parse: JSON.parse,
            parameters: {
              type: 'object',
              properties: {
                searchTimeStartDaysInFuture: { type: 'number' },
                searchTimeStartHoursInFuture: { type: 'number' },
                searchTimeStartMinutesInFuture: { type: 'number' },
                user_id: { type: 'number' },
              },
            },
          },
        },
      ],
    })

    const finalContent = await runner.finalContent()
    return finalContent
  }
}

async function create_event({
  name,
  timeFromNowInSeconds,
  user_id,
}: {
  name: string
  timeFromNowInSeconds: number
  user_id: number
}) {
  const eventTime = new Date(Date.now() + timeFromNowInSeconds * 1000)
  const eventTimeString = eventTime.toISOString()

  try {
    const event = await createEvent({
      name,
      date: eventTimeString,
      user_id,
    })

    const reminderDate = getReminderDate(eventTime)

    await createReminder({
      event_id: event.id,
      user_id: user_id,
      date: reminderDate,
    })
  } catch (e) {
    console.log('error creating event: ', e)
    return e.message
  }
}

async function search_for_events({
  searchTimeStartDaysInFuture = 0,
  searchTimeStartHoursInFuture = 0,
  searchTimeStartMinutesInFuture = 0,
  user_id,
  ...rest
}: {
  searchTimeStartDaysInFuture: number
  searchTimeStartHoursInFuture: number
  searchTimeStartMinutesInFuture: number
  user_id: number
}) {
  let eventStartSearchStartTime = new Date(Date.now())
  eventStartSearchStartTime.setDate(eventStartSearchStartTime.getDate() + searchTimeStartDaysInFuture)
  // subtrack 24 hours to account for the fact that we are searching for events that start at the beginning of the day
  eventStartSearchStartTime.setHours(eventStartSearchStartTime.getHours() - 24 + searchTimeStartHoursInFuture)
  eventStartSearchStartTime.setMinutes(
    eventStartSearchStartTime.getMinutes() + searchTimeStartMinutesInFuture
  )

  let eventEndTime = new Date(eventStartSearchStartTime.getTime())
  eventEndTime.setHours(eventEndTime.getHours() + 24)

  try {
    const events = await searchForEvents({
      start: new Date(eventStartSearchStartTime).toISOString(),
      end: new Date(eventEndTime).toISOString(),
      user_id,
    })

    if (events.length === 0) {
      return 'No events found'
    }

    return events.map((event) => event.name).join(', ')
  } catch (e) {
    console.log('error searching for events: ', e)
    return e.message
  }
}

const getReminderDate = (eventTime: Date) => {
  // If event is more than 72 hours away, remind 24 hours before
  // If event is less than 72 hours away, remind 1 hour before

  const now = new Date()
  const timeDifference = eventTime.getTime() - now.getTime()
  const hoursDifference = timeDifference / 1000 / 60 / 60

  if (hoursDifference > 72) {
    return new Date(eventTime.getTime() - 24 * 60 * 60 * 1000).toISOString()
  }

  return new Date(eventTime.getTime() - 60 * 60 * 1000).toISOString()
}
