import type { Telemetry } from "@keystone/kernel";
import type { PostgresHandle } from "./client";
import { DrizzleSettingsRepository } from "./settings-repository";
import { PostgresIdempotencyStore } from "./idempotency";
import { DrizzleCaseStore } from "./case-store";
import { DrizzleCommunityStore } from "./community-store";
import { DrizzleAiStore } from "./ai-store";
import { DrizzlePortabilityStore } from "./portability-store";
import { DrizzleSessionStore } from "./web-session-store";
import { DrizzleDashboardStore } from "./web-dashboard-store";
import { DrizzleInviteStore } from "./invite-store";

/**
 * Factories so the composition root never needs Drizzle's generic types.
 * Keeping the casts here is the difference between one awkward file and an
 * application layer that knows about query builders.
 */
export function createSettingsRepository(
  handle: PostgresHandle,
  telemetry?: Telemetry,
): DrizzleSettingsRepository {
  return new DrizzleSettingsRepository(handle.db as never, telemetry);
}

export function createIdempotencyStore(handle: PostgresHandle): PostgresIdempotencyStore {
  return new PostgresIdempotencyStore(handle.db as never);
}

export function createCaseStore(handle: PostgresHandle): DrizzleCaseStore {
  return new DrizzleCaseStore(handle.db as never);
}

export function createCommunityStore(handle: PostgresHandle): DrizzleCommunityStore {
  return new DrizzleCommunityStore(handle.db as never);
}

export function createAiStore(handle: PostgresHandle): DrizzleAiStore {
  return new DrizzleAiStore(handle.db as never);
}

export function createPortabilityStore(handle: PostgresHandle): DrizzlePortabilityStore {
  return new DrizzlePortabilityStore(handle.db as never);
}

export function createSessionStore(handle: PostgresHandle): DrizzleSessionStore {
  return new DrizzleSessionStore(handle.db as never);
}

export function createDashboardStore(handle: PostgresHandle): DrizzleDashboardStore {
  return new DrizzleDashboardStore(handle.db as never);
}

export function createInviteStore(handle: PostgresHandle): DrizzleInviteStore {
  return new DrizzleInviteStore(handle.db as never);
}
