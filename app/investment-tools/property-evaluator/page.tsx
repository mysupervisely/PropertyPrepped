'use client'

// Investment Tools 2.0: this route was renamed to
// /investment-tools/rental-analyzer (see that folder for the real page —
// same component, same calculations, same saved-analysis data shape,
// only the name/URL/address-field changed). This stub exists ONLY so any
// existing bookmark or saved link to the old
// /investment-tools/property-evaluator?analysisId=... URL keeps working —
// it forwards every query param unchanged and never renders its own UI.

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RedirectToRentalAnalyzer() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const query = searchParams.toString()
    router.replace(`/investment-tools/rental-analyzer${query ? `?${query}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function PropertyEvaluatorRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectToRentalAnalyzer />
    </Suspense>
  )
}
