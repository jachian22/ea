/**
 * Discord utility functions
 */

/**
 * Splits long messages to fit within Discord's 2000 character limit.
 * Tries to split at newlines, then spaces, before force-splitting.
 *
 * @param content The message content to split
 * @param maxLength Maximum length per chunk (default: 1900 to leave room for formatting)
 * @returns Array of message chunks
 */
export function splitMessage(content: string, maxLength = 1900): string[] {
  if (content.length <= maxLength) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Try to split at a space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Force split
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}
