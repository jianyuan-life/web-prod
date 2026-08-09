'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { isConsultationReaderPath } from '@/lib/consultation/routes'

import GlobalBackToTop from './GlobalBackToTop'
import Navbar from './Navbar'

type RouteChromeProps = {
  beforeMain?: ReactNode
  children: ReactNode
  footer: ReactNode
}

/**
 * Owns the public-site chrome at the route boundary.
 *
 * Consultation access and reader routes are private product surfaces. Keeping
 * the decision here means their first render has neither commercial chrome nor
 * the public navbar's reserved 64px, including the token-exchange screen that
 * does not yet contain a report DOM marker.
 */
export default function RouteChrome({ beforeMain, children, footer }: RouteChromeProps) {
  const pathname = usePathname()
  const isPrivateConsultation = isConsultationReaderPath(pathname?.toLowerCase())

  return (
    <>
      {!isPrivateConsultation && <Navbar />}
      {!isPrivateConsultation && beforeMain}
      <main
        id="main-content"
        tabIndex={-1}
        className={isPrivateConsultation ? undefined : 'pt-16'}
        data-route-chrome={isPrivateConsultation ? 'consultation-private' : 'public'}
      >
        {children}
      </main>
      {!isPrivateConsultation && <GlobalBackToTop />}
      {!isPrivateConsultation && footer}
    </>
  )
}
