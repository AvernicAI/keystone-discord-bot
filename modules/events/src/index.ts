export { eventsModule } from "./manifest";
export { event } from "./commands/event";
export { EventService, parseInstant, slugify, type EventExport } from "./events";
export { buildEventCalendar, type CalendarSource } from "./ics";
export { buildEventPanel, capacityLine, eventPanelTtlMs, type EventPanel, type EventPanelCounts } from "./panel";
export {
  EventReminderService,
  type EventPanelPoster,
  type EventPanelSigner,
  type ReminderSweep,
} from "./reminders";
export { InMemoryEventStore } from "./store";
export { eventDefaultSettings, eventSettingsSchema, type EventSettings } from "./settings";
