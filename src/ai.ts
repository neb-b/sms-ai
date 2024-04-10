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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `
              You are an SMS based AI assistant.
              All messages should be short and to the point.
              You can create events, and query for created events if the user asks.
              If there is some reference of a date ("next week", "the 24th", "tomorrow") assume the user is trying to create an event or see if there is an event already created for that date.
              Another service will run a job that ensures the user is reminded of these events properly. You do not directly create reminders, only events.
              Do not ask about creating reminders for events - a reminder service will handle that - assume if they mention a date they want to search or create an event.
              Call the provided functions to create events and search for events. The functions will handle the database operations.
              The current ISO date is ${new Date().toISOString()}.
              The current day of week is ${new Date().toLocaleString('en-us', { weekday: 'long' })}.
              If a user asks about "this weekend", assume they are asking about the next upcoming Friday through Sunday.
              If a user asks about "next weekend", if they are currently on a Friday, Saturday, or Sunday, assume they are asking about the following weekend ~7 days in the future. Otherwise, assume they are asking about the upcoming Friday through Sunday.
              If a user asks about "next week", assume they are asking about the upcoming Monday through Sunday.
              Always provide the exact date (and time if applicable) of the event in the response.
              If there is no time specified, assume the event is at 12:00 PM.
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
                  dateISOString: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'function',
            function: {
              function: searchForUserEvents(userId),
              description: `
                Searches for events around a specified date for the user.
                Provide a searchISOString so that I can query my database for events around that time.
                Do not worry about the time of the event, only the date.
                The searchISOString is an ISO string of the date you want to search around.
                searchISO string is REQUIRED!!! Your must provide a searchISOString.
                I will add padding to the date so you need to return a date in the middle of this search window.
                For example, if the user asks about "this weekend", provide a date in the middle of the upcoming Friday through Sunday.
                If the user asks about "next week", provide a date in the middle of the upcoming Monday through Sunday.
              `,
              parse: JSON.parse,
              parameters: {
                type: 'object',
                properties: {
                  isUserAskingAboutAWeekend: { type: 'boolean' },
                  isUserAskingAboutAFullWeek: { type: 'boolean' },
                  searchISOString: { type: 'string' },
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
  async function createUserEvent({ name, dateISOString }: { name: string; dateISOString: string }) {
    console.log('function_call: createUserEvent', { name, dateISOString })

    try {
      const event = await createEvent({
        name,
        date: dateISOString,
        user_id: userId,
      })

      const eventTime = new Date(dateISOString)
      const reminderDate = getReminderDate(eventTime)

      await createReminder({
        event_id: event.id,
        user_id: userId,
        date: reminderDate,
      })
      return `Event created: ${name} on ${dateISOString} with a reminder on ${reminderDate}`
    } catch (e) {
      console.log('error creating event: ', e)
      return e.message
    }
  }

const searchForUserEvents = (userId: number) =>
  async function searchForUserEvents({
    isUserAskingAboutAWeekend,
    isUserAskingAboutAFullWeek,
    searchISOString,
  }: {
    isUserAskingAboutAWeekend: boolean
    isUserAskingAboutAFullWeek: boolean
    searchISOString: string
  }) {
    console.log('function_call: searchForUserEvents', {
      isUserAskingAboutAWeekend,
      isUserAskingAboutAFullWeek,
      searchISOString,
    })

    try {
      const eventStartSearchStartTime = new Date(searchISOString)
      const eventEndTime = new Date(eventStartSearchStartTime.getTime())

      if (isUserAskingAboutAWeekend) {
        eventStartSearchStartTime.setDate(eventStartSearchStartTime.getDate() - 1.5)
        eventEndTime.setDate(eventEndTime.getDate() + 1.5)
      } else if (isUserAskingAboutAFullWeek) {
        eventStartSearchStartTime.setDate(eventStartSearchStartTime.getDate() - 3.5)
        eventEndTime.setDate(eventEndTime.getDate() + 3.5)
      } else {
        eventStartSearchStartTime.setDate(eventStartSearchStartTime.getDate() - 1)
        eventEndTime.setDate(eventEndTime.getDate() + 1)
      }

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
      return 'There was an error searching for events. Please try again.'
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
