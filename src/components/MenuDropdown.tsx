import { useState, type ReactNode } from 'react'

interface Props {
  label: ReactNode
  title?: string
  children: ReactNode
}

export function MenuDropdown({ label, title, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={`menu-dropdown${open ? ' is-open' : ''}`}
      title={title}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className="btn menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      <div className="menu-panel" role="menu">
        {children}
      </div>
    </div>
  )
}
