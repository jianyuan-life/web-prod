import type { ReactNode } from 'react'

const EARLY_FRAGMENT_HANDOFF = `
  (() => {
    try {
      const fragment = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (!fragment) return;
      Object.defineProperty(window, '__JY_CONSULTATION_FRAGMENT__', {
        value: fragment,
        configurable: true,
        enumerable: false,
        writable: false
      });
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
      );
    } catch {
      // The access client repeats the same fail-closed cleanup after hydration.
    }
  })();
`

export default function ConsultationAccessLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Runs while the initial HTML is parsed, before React hydration or any
          report exchange request. The fragment is handed over in memory only. */}
      <script dangerouslySetInnerHTML={{ __html: EARLY_FRAGMENT_HANDOFF }} />
      {children}
    </>
  )
}
