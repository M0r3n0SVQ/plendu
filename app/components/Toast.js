'use client'

import { useEffect, useRef } from 'react'

export default function Toast({ message, type, onDone, duration = 3000, action, onAction }) {
  // The parent passes a fresh onDone={() => setToast(null)} on every render,
  // so depending on it directly would restart this timer on any unrelated
  // parent re-render (typing in another field, etc.) — a ref lets the timer
  // always call the latest onDone without needing it in the effect's deps.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), duration)
    return () => clearTimeout(t)
  }, [duration])

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
