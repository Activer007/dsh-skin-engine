import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react'

type Tab<Value extends string> = { value: Value; label: ReactNode; id: string; panelId: string }
interface TabsProps<Value extends string> {
  items: readonly [Tab<Value>, ...Tab<Value>[]]
  value: Value
  label: string
  onChange(value: Value): void
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }
type HostButtonProps = Omit<ButtonProps, 'primary'> & { variant: 'primary' | 'outline' }
type SwitchProps = { checked: boolean; label: string; onChange(value: boolean): void }
interface Primitives {
  Button?: (props: HostButtonProps) => ReactNode
  SegmentedTabs?: <Value extends string>(props: TabsProps<Value>) => ReactNode
  Switch?: (props: SwitchProps) => ReactNode
}

declare const require: (name: string) => Primitives | undefined

function hostControls(): Primitives {
  try { return require('@deepseek-ai/dsh-client-ui-primitives') ?? {} }
  catch { return {} }
}

const { Button, SegmentedTabs, Switch } = hostControls()

export function SettingsButton({ primary, className, ...props }: ButtonProps) {
  if (Button) return <Button variant={primary ? 'primary' : 'outline'} className={className} data-dsh-skin-native-control {...props} />
  return <button type="button" className={[primary && 'dsh-skin-primary', className].filter(Boolean).join(' ')} {...props} />
}

export function SettingsSwitch({ checked, label, onChange }: SwitchProps) {
  if (Switch) return <span className="dsh-skin-setting-toggle" data-dsh-skin-native-control>
    <Switch checked={checked} label={label} onChange={onChange} />
    <span aria-hidden="true">{label}</span>
  </span>
  return <label><input type="checkbox" checked={checked} onChange={event => onChange(event.currentTarget.checked)} />{label}</label>
}

export function SettingsTabs<Value extends string>({ items, value, label, onChange }: TabsProps<Value>) {
  if (SegmentedTabs) return <div className="dsh-skin-native-tabs" data-dsh-skin-native-control>
    <SegmentedTabs items={items} value={value} label={label} onChange={onChange} />
  </div>

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + items.length - 1) % items.length; break
      case 'ArrowRight': next = (index + 1) % items.length; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    const tab = items[next]
    if (!tab) return
    event.preventDefault()
    document.getElementById(tab.id)?.focus()
    onChange(tab.value)
  }

  return <div className="dsh-skin-tabs" role="tablist" aria-label={label}>
    {items.map((tab, index) => <button key={tab.value} type="button" role="tab" id={tab.id} aria-controls={tab.panelId}
      aria-selected={value === tab.value} tabIndex={value === tab.value ? 0 : -1}
      onClick={() => onChange(tab.value)} onKeyDown={event => move(event, index)}>{tab.label}</button>)}
  </div>
}
