export { modmailModule } from "./manifest";
export { modmail } from "./commands/modmail";
export {
  ModmailService,
  type ModmailActor,
  type ModmailCloseOutcome,
  type ModmailOpenInput,
  type ModmailReplyOutcome,
  type ModmailTranscriptView,
} from "./modmail";
export { InMemoryModmailStore } from "./store";
export {
  modmailDefaultSettings,
  modmailSettingsSchema,
  type ModmailSettings,
} from "./settings";
