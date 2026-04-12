export function stripAssistantActionMarkup(raw: string): string {
  const withoutClosed = raw.replace(/<action>[\s\S]*?<\/action>/gi, "");
  const openIndex = withoutClosed.search(/<action>/i);
  return (openIndex >= 0 ? withoutClosed.slice(0, openIndex) : withoutClosed).trim();
}
