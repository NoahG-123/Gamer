import { loadContent, listCharacterIds } from "../content";

export interface CharacterConfig {
  id: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  historyWindow?: number;
  systemPrompt: string;
  /** Extra prompt text appended while the named story flag is set: lets a character know what the player has found. */
  situations?: Record<string, string>;
  /** Minutes before an email reply lands. */
  emailDelayMinutes?: [number, number];
  /** Extra prompt used only for email replies. */
  emailPrompt?: string;
  reply?: { readDelayMs?: [number, number]; typingMsPerChar?: [number, number]; maxTypingMs?: number; splitOnNewlines?: boolean };
}

export function loadCharacter(id: string): CharacterConfig | null {
  if (!listCharacterIds().includes(id)) return null;
  return loadContent<CharacterConfig>(`characters/${id}.json`);
}

export function listCharacters(): CharacterConfig[] {
  return listCharacterIds().map((id) => loadContent<CharacterConfig>(`characters/${id}.json`));
}
