export const CONSULTATION_AUTH_TIMEOUT_MS = 8_000

export async function withClientTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(operation), timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
