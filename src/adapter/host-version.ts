// Resolve through the profile's runtime package table to use the running Host's copy.
const appBootPackage = '@deepseek-ai/dsh-app-boot'

export async function readDshRuntimeVersion(): Promise<string | undefined> {
  try {
    const appBoot = await import(appBootPackage)
    const version: unknown = appBoot.getDshRuntimeVersion()
    return typeof version === 'string' ? version : undefined
  } catch (error) {
    console.warn('[skin-engine] cannot read the DSH runtime version', error)
    return undefined
  }
}
