/**
 * An error whose message is safe to show to the user who ran the command.
 * Anything else is logged and replaced with a generic message, so stack traces
 * and internal IDs never leak into a Discord channel.
 */
export class UserError extends Error {
  constructor(
    message: string,
    readonly options: { cause?: unknown } = {},
  ) {
    super(message);
    this.name = "UserError";
  }
}
