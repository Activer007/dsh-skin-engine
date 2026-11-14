import { SkinWorkspace, type WorkspaceProps } from './skin-workspace.js'

export type PanelProps = WorkspaceProps

/** Compatibility surface: old settings keeps its own modal-scoped drafts. */
export function SkinPanel(props: PanelProps) {
  return <SkinWorkspace {...props} surface="settings" />
}
