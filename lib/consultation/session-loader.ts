import {
  loadConsultationReport,
  type ConsultationReportLoadResult,
} from './load-report.ts'
import {
  openConsultationSession,
  type ConsultationSessionOpenResult,
} from './session.ts'

type ConsultationSessionLoaderDependencies = {
  open?: (sealed: unknown, expectedHandle: unknown) => Promise<ConsultationSessionOpenResult>
  load?: (token: unknown) => Promise<ConsultationReportLoadResult>
}

export type ConsultationSessionLoadResult =
  | ConsultationReportLoadResult
  | {
      ok: false
      code: 'configuration_error' | 'invalid_session' | 'expired_session'
    }

export async function loadConsultationReportFromSession(
  sealed: unknown,
  expectedHandle: unknown,
  dependencies: ConsultationSessionLoaderDependencies = {},
): Promise<ConsultationSessionLoadResult> {
  const opened = await (dependencies.open ?? openConsultationSession)(sealed, expectedHandle)
  if (!opened.ok) return opened

  try {
    return await (dependencies.load ?? loadConsultationReport)(opened.token)
  } catch {
    return { ok: false, code: 'database_error' }
  }
}
