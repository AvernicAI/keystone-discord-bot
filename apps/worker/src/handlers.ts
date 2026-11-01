import { auditEvents, createSettingsRepository, type PostgresHandle } from "@keystone/db";
import type { JobHandler } from "@keystone/queue";

export interface SettingsSnapshotPayload {
  guildId: string;
  moduleId: string;
}

/**
 * `settings.snapshot` is the first real job: it reads a guild's module settings
 * and writes an audit record. It is the groundwork for export/backup in P5, and
 * it gives P1 a side effect that can be retried and checked.
 */
export function createHandlers(database: PostgresHandle): Record<string, JobHandler> {
  const settings = createSettingsRepository(database);

  return {
    "settings.snapshot": async (payload, ctx) => {
      const data = payload as Partial<SettingsSnapshotPayload>;
      if (!data.guildId || !data.moduleId) {
        throw new Error("settings.snapshot requires { guildId, moduleId }");
      }

      const values = await settings.get(data.guildId, data.moduleId);

      await database.db.insert(auditEvents).values({
        guildId: data.guildId,
        actorId: "system",
        action: "settings.snapshot",
        targetId: data.moduleId,
        data: { settings: values ?? null, jobId: ctx.id },
      });
    },
  };
}
