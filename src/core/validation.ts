import type { output, ZodMiniType } from 'zod/mini'

export interface SkinDiagnostic {
  file: string
  path: string
  code: string
  message: string
}

export class SkinValidationError extends Error {
  constructor(readonly diagnostics: readonly SkinDiagnostic[]) {
    super(diagnostics.map(issue => `${issue.file}:${issue.path}: ${issue.message}`).join('\n'))
    this.name = 'SkinValidationError'
  }
}

export function parseFile<Schema extends ZodMiniType>(
  schema: Schema,
  value: unknown,
  file: string,
  prefix = '',
): output<Schema> {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  throw new SkinValidationError(parsed.error.issues.map(issue => ({
    file,
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    code: issue.code,
    message: issue.message,
  })))
}

export function invalid(file: string, path: string, code: string, message: string): never {
  throw new SkinValidationError([{ file, path, code, message }])
}
