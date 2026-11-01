import type {
  LoggingActions,
  LoggingActionResult,
  LoggingNotice,
} from "@keystone/kernel";
import { loggingSettingsSchema, type LoggingSettings } from "./settings";

/** Records every delivery and can simulate a failed Discord send. */
export class RecordingLoggingActions implements LoggingActions {
  readonly notices: { guildId: string; channelId: string; notice: LoggingNotice }[] = [];
  result: LoggingActionResult = { ok: true };

  async send(
    guildId: string,
    channelId: string,
    notice: LoggingNotice,
  ): Promise<LoggingActionResult> {
    this.notices.push({ guildId, channelId, notice });
    return this.result;
  }
}

export function loggingTestSettings(overrides: Partial<LoggingSettings> = {}): LoggingSettings {
  return loggingSettingsSchema.parse({
    enabled: true,
    channelId: "log-channel",
    ...overrides,
  });
}
