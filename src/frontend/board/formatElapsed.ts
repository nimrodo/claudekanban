/**
 * Formats elapsed time in milliseconds as a human-readable string.
 *
 * Format scheme:
 * - Under 60 seconds: seconds only (e.g., "12s")
 * - 60 seconds to 3599 seconds: minutes + seconds (e.g., "6m 12s")
 * - 3600 seconds or more: hours + minutes (e.g., "1h 4m")
 *
 * @param ms elapsed time in milliseconds
 * @returns formatted string like "12s", "6m 12s", or "1h 4m"
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);

  // Under 60 seconds: show seconds only
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  // Under 1 hour: show minutes + seconds
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  // 1 hour or more: show hours + minutes
  const hours = Math.floor(totalSeconds / 3600);
  const remainingSeconds = totalSeconds % 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  return `${hours}h ${minutes}m`;
}
