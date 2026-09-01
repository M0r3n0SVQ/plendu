'use client'

import { useEffect } from 'react'

export default function Toast({ message, type, onDone, duration = 3000, action, onAction }) {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration])

  return (
    <div
      className={`toast ${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <span>{message}</span>
      {action && onAction && (
        <button
          className="toast-action"
          onClick={() => { onAction(); onDone() }}
        >
          {action}
        </button>
      )}
    </div>
  )
}
