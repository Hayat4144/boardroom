/** Message thrown by every not-yet-implemented HAYAT stub. */
export const STUB_MESSAGE_PREFIX = "TODO(HAYAT)";

export function isStubError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith(STUB_MESSAGE_PREFIX);
}
