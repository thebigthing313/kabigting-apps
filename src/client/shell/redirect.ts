/** Only same-origin paths may be used as a post-sign-in destination. */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/"
  return target
}
