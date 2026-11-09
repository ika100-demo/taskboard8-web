export const MAX_TITLE_LENGTH = 200;

export type TitleCheck =
  | { ok: true; title: string }
  | { ok: false; error: "empty" | "too_long" };

export function validateTitle(raw: string): TitleCheck {
  const title = raw.trim();
  if (title === "") return { ok: false, error: "empty" };
  if ([...title].length > MAX_TITLE_LENGTH) return { ok: false, error: "too_long" };
  return { ok: true, title };
}
