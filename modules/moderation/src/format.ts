import type { EmbedPayload, ModerationCase } from "@keystone/kernel";

/** One case rendering used by /mod, security alerts and the review queue. */
export function caseEmbed(record: ModerationCase, title = `Case #${record.caseNumber}`): EmbedPayload {
  return {
    title,
    description: record.reason,
    color: record.state === "open" || record.state === "pending" ? 0xfee75c : 0x5865f2,
    fields: [
      { name: "Action", value: record.action, inline: true },
      { name: "Target", value: record.targetId, inline: true },
      { name: "State", value: record.state, inline: true },
      { name: "Actor", value: record.actorId, inline: true },
      { name: "Rule", value: record.rule ?? "manual", inline: true },
      { name: "Case", value: `#${record.caseNumber}`, inline: true },
    ],
    footer: { text: "Case events are append-only. Appeal with /appeal or the button." },
  };
}

export function caseListEmbed(records: readonly ModerationCase[], title: string): EmbedPayload {
  if (records.length === 0) {
    return { title, description: "No matching cases.", color: 0x57f287 };
  }
  return {
    title,
    description: records
      .map(
        (record) =>
          `**#${record.caseNumber}** · ${record.action} · <@${record.targetId}> · ${record.state}\n${record.reason}`,
      )
      .join("\n\n")
      .slice(0, 4_000),
    color: 0x5865f2,
    footer: { text: "Newest first. Use /mod case for one record." },
  };
}
