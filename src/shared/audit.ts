export const AUDIT_PATH = 'api/dsh-skin-engine/audit'

export interface AuditStatus {
  persisted: boolean
  engineVersion?: string
}
