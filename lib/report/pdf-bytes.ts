const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const
export const MIN_REPORT_PDF_BYTES = 8
export const MAX_REPORT_PDF_BYTES = 5 * 1024 * 1024
export const MAX_REPORT_PDF_BASE64_LENGTH = Math.ceil(MAX_REPORT_PDF_BYTES / 3) * 4
export const MAX_REPORT_PDF_RESPONSE_BYTES = MAX_REPORT_PDF_BASE64_LENGTH + 16 * 1024

function invalidPdfBytes(): never {
  throw new Error('invalid PDF bytes')
}

export function assertValidPdfBytes<T extends Uint8Array>(bytes: T): T {
  if (bytes.byteLength < MIN_REPORT_PDF_BYTES || bytes.byteLength > MAX_REPORT_PDF_BYTES) {
    invalidPdfBytes()
  }
  if (PDF_MAGIC_BYTES.some((expected, index) => bytes[index] !== expected)) {
    invalidPdfBytes()
  }
  return bytes
}

/** Decode PDF bytes only after the calculator response crosses this boundary. */
export function decodeCanonicalPdfBase64(input: unknown): Buffer {
  if (typeof input !== 'string') invalidPdfBytes()
  if (
    input.length === 0
    || input.length > MAX_REPORT_PDF_BASE64_LENGTH
    || input.length % 4 !== 0
    || !/^[A-Za-z0-9+/]*={0,2}$/u.test(input)
  ) {
    invalidPdfBytes()
  }
  const paddingLength = input.endsWith('==') ? 2 : input.endsWith('=') ? 1 : 0
  const decodedLength = (input.length / 4) * 3 - paddingLength
  if (decodedLength < MIN_REPORT_PDF_BYTES || decodedLength > MAX_REPORT_PDF_BYTES) {
    invalidPdfBytes()
  }
  const bytes = Buffer.from(input, 'base64')
  if (bytes.toString('base64') !== input) invalidPdfBytes()
  return assertValidPdfBytes(bytes)
}

export async function readBoundedPdfResponse(
  response: Response,
  options: { timeoutMs?: number } = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 90_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 90_000) {
    invalidPdfBytes()
  }
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (
      !Number.isSafeInteger(parsedLength)
      || parsedLength < 0
      || parsedLength > MAX_REPORT_PDF_RESPONSE_BYTES
    ) {
      invalidPdfBytes()
    }
  }
  if (!response.body) invalidPdfBytes()

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('PDF response body timeout')), timeoutMs)
  })
  let totalBytes = 0
  let json = ''
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_REPORT_PDF_RESPONSE_BYTES) invalidPdfBytes()
      json += decoder.decode(value, { stream: true })
    }
    json += decoder.decode()
  } catch {
    void reader.cancel().catch(() => undefined)
    invalidPdfBytes()
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    try { reader.releaseLock() } catch { /* reader cancellation owns the lock */ }
  }

  let payload: unknown
  try {
    payload = JSON.parse(json)
  } catch {
    invalidPdfBytes()
  }
  if (
    typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || !Object.hasOwn(payload, 'pdf_base64')
  ) {
    invalidPdfBytes()
  }
  return decodeCanonicalPdfBase64((payload as { pdf_base64?: unknown }).pdf_base64)
}
