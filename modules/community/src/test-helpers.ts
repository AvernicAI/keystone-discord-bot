import type { RecordingCommunityActions } from "./testing";

export function birthdayOutput(actions: RecordingCommunityActions): number {
  return actions.sent.filter((entry) => entry.message.content?.includes("Happy birthday")).length;
}
