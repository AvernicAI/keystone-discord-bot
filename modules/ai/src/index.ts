export { aiModule } from "./manifest";
export { ai } from "./commands/ai";
export { aiDefaultSettings, aiSettingsSchema, type AiSettings } from "./settings";
export { InMemoryAiStore } from "./store";
export {
  DeterministicAiProvider,
  OpenAiCompatibleProvider,
  UnavailableAiProvider,
  createAiProvider,
  embedLocally,
  type AiProviderConfig,
} from "./provider";
export {
  AiService,
  chunkText,
  cosineSimilarity,
  periodFor,
} from "./service";
