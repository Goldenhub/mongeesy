import { describe, it, expect } from 'vitest'
import { shouldRemind, reminderNotification } from './reminder-rules.js'

const HOUR = 60 * 60 * 1000
const now = 1_800_000_000_000
const on = { enabled: true, intervalMinutes: 60, systemNotifications: true, inAppNotifications: true }

describe('shouldRemind', () => {
  it('never reminds when reminders are off', () => {
    expect(shouldRemind({ now, settings: { ...on, enabled: false }, visible: false })).toEqual({ system: false, inApp: false })
    expect(shouldRemind({ now, settings: undefined, visible: false })).toEqual({ system: false, inApp: false })
  })

  it('sends a system notification when due and the app is not in front', () => {
    expect(shouldRemind({ now, settings: on, visible: false })).toEqual({ system: true, inApp: false })
  })

  it('shows the in-app popup instead while the app is in front', () => {
    expect(shouldRemind({ now, settings: on, visible: true })).toEqual({ system: false, inApp: true })
  })

  it('skips while the user practiced within the interval', () => {
    expect(shouldRemind({ now, settings: on, lastActivityAt: now - HOUR / 2, visible: false })).toEqual({ system: false, inApp: false })
    expect(shouldRemind({ now, settings: on, lastActivityAt: now - 2 * HOUR, visible: false }).system).toBe(true)
  })

  it('skips when another tab or the service worker reminded within the interval', () => {
    expect(shouldRemind({ now, settings: on, lastReminderAt: now - HOUR / 2, visible: false }).system).toBe(false)
    expect(shouldRemind({ now, settings: on, lastReminderAt: now - HOUR - 1, visible: false }).system).toBe(true)
  })

  it('respects each channel being turned off', () => {
    expect(shouldRemind({ now, settings: { ...on, systemNotifications: false }, visible: false })).toEqual({ system: false, inApp: false })
    expect(shouldRemind({ now, settings: { ...on, inAppNotifications: false }, visible: true })).toEqual({ system: false, inApp: false })
  })
})

describe('reminderNotification', () => {
  it('names the next lesson and carries its id for the click handler', () => {
    const { options } = reminderNotification({ id: 0, title: 'What is MongoDB?' })
    expect(options.body).toBe('Try lesson: What is MongoDB?')
    expect(options.data.lessonId).toBe(0)
  })

  it('has a generic message when every lesson is done', () => {
    expect(reminderNotification(null).options.data.lessonId).toBe(null)
  })
})
