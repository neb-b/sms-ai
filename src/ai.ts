import OpenAI from 'openai'
import { createEvent, createReminder, searchForEvents, createMessages } from './db'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export class ai {
  static async complete({
    userId,
    messages = [],
    message,
  }: {
    userId: number
    messages: { role: 'system' | 'user'; content: string }[]
    message: string
  }): Promise<string> {
    let responseMessages = []
    const formattedMessages = messages.map((message) => {
      return {
        ...message,
        content: message.content ?? '',
      }
    })

    const runner = openai.beta.chat.completions
      .runTools({
        model: 'gpt-4-turbo-2024-04-09',
        messages: [
          {
            role: 'system',
            content: `
              You are an SMS based AI assistant.
              All messages should be short and to the point.
              You can create events for the user.
              Do not create events unless the user specifically asks to create or add an event.
              Another service will run a job that ensures the user is reminded of these events properly.
              The current date is ${new Date().toISOString()}.
              If a user asks about "this weekend", assume they are asking about the next upcoming Friday through Sunday.
              Always provide the exact date (and time if applicable) of the event in the response.
              If a user asks about "next week", assume they are asking about the upcoming Monday through Sunday.
              Do not ask about creating reminders for events - a reminder service will handle that - assume if they mention a date they want to search or create an event.
            `,
          },
          ...formattedMessages,
          {
            role: 'user',
            content: message,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              function: createUserEvent(userId),
              description: 'Creates an event at a specified time in the future for the user',
              parse: JSON.parse,
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  timeFromNowInSeconds: { type: 'number' },
                },
              },
            },
          },
          {
            type: 'function',
            function: {
              function: searchForUserEvents(userId),
              description: 'Lets the user know if there is a scheduled event at a specic time in the future',
              parse: JSON.parse,
              parameters: {
                type: 'object',
                properties: {
                  searchTimeStartDaysInFuture: { type: 'number' },
                  searchTimeStartHoursInFuture: { type: 'number' },
                  searchTimeStartMinutesInFuture: { type: 'number' },
                },
              },
            },
          },
        ],
      })
      .on('message', (message) => {
        responseMessages.push(message)
      })

    const finalContent = await runner.finalContent()

    const passedMessagesCount = messages.length
    const inputLength = passedMessagesCount + 1 // +1 for the system message message
    const outputLength = responseMessages.length
    const newMessages = responseMessages.slice(inputLength, outputLength).map((message) => {
      const newMessage = {
        user_id: userId,
      }

      if (message.role === 'user') {
        return {
          ...newMessage,
          ...message,
        }
      }

      if (message.tool_calls) {
        const toolCalls = message.tool_calls[0]

        return {
          ...newMessage,
          role: 'system',
          content: null,
          tool_call_id: toolCalls.id,
          tool_call_type: toolCalls.type,
          tool_call_function: toolCalls.function.name,
          tool_call_function_args: toolCalls.function.arguments,
        }
      }

      if (message.role === 'tool') {
        return {
          ...newMessage,
          role: 'system',
          content: message.content,
          tool_call_id: message.tool_call_id,
        }
      }

      return {
        ...newMessage,
        role: message.role,
        content: message.content,
      }
    })

    createMessages(newMessages)
    return finalContent
  }
}

const createUserEvent = (userId: number) =>
  async function createUserEvent({
    name,
    timeFromNowInSeconds,
  }: {
    name: string
    timeFromNowInSeconds: number
  }) {
    const eventTime = new Date(Date.now() + timeFromNowInSeconds * 1000)
    const eventTimeString = eventTime.toISOString()

    try {
      const event = await createEvent({
        name,
        date: eventTimeString,
        user_id: userId,
      })

      const reminderDate = getReminderDate(eventTime)

      await createReminder({
        event_id: event.id,
        user_id: userId,
        date: reminderDate,
      })
      return `Event created: ${name} on ${eventTimeString} with a reminder on ${reminderDate}`
    } catch (e) {
      console.log('error creating event: ', e)
      return e.message
    }
  }

const searchForUserEvents = (userId: number) =>
  async function searchForUserEvents({
    searchTimeStartDaysInFuture = 0,
    searchTimeStartHoursInFuture = 0,
    searchTimeStartMinutesInFuture = 0,
  }: {
    searchTimeStartDaysInFuture: number
    searchTimeStartHoursInFuture: number
    searchTimeStartMinutesInFuture: number
  }) {
    let eventStartSearchStartTime = new Date(Date.now())
    eventStartSearchStartTime.setDate(eventStartSearchStartTime.getDate() + searchTimeStartDaysInFuture)
    // subtrack 24 hours to account for the fact that we are searching for events that start at the beginning of the day
    eventStartSearchStartTime.setHours(
      eventStartSearchStartTime.getHours() - 24 + searchTimeStartHoursInFuture
    )
    eventStartSearchStartTime.setMinutes(
      eventStartSearchStartTime.getMinutes() + searchTimeStartMinutesInFuture
    )

    let eventEndTime = new Date(eventStartSearchStartTime.getTime())
    eventEndTime.setHours(eventEndTime.getHours() + 24)

    try {
      const events = await searchForEvents({
        start: new Date(eventStartSearchStartTime).toISOString(),
        end: new Date(eventEndTime).toISOString(),
        user_id: userId,
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
