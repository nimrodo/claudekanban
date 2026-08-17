export function deriveMainTitle(prompt: string | undefined): string | null {
  if (!prompt) return null;
  const firstLine = prompt.split("\n")[0].trim();
  return firstLine.length > 0 ? firstLine : null;
}
