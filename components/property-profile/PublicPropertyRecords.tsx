'use client'

import { useState } from 'react'

export function PublicPropertyRecords({ address, city, onEdit }: { address: string; city: string; onEdit: () => void }) {
  const [notice, setNotice] = useState('')
  const florida = /(?:^|[,\s])(?:FL|Florida)(?:\s|$|,)/i.test(city)
  if (!florida) return null
  return <div className="publicPropertyRecords">
    <div className="publicPropertyRecordsHeading"><h3>County property records</h3><a className="textAction" href="https://floridarevenue.com/property/Pages/LocalOfficials.aspx" target="_blank" rel="noopener noreferrer">Find county records</a></div>
    <p className="muted">Check your county’s property appraiser for building details, lot size, recorded sales, assessments and exemptions. Available records vary by county.</p>
    <p className="muted">County tax assessments and current resale estimates are different. These records are not automatically imported into PropRoster.</p>
    <div className="publicPropertyRecordsActions"><button type="button" className="textAction" onClick={async () => { try { await navigator.clipboard.writeText([address, city].filter(Boolean).join(', ')); setNotice('Address copied. Paste it into the county’s property search.') } catch { setNotice([address, city].filter(Boolean).join(', ')) } }}>Copy property address</button><button type="button" className="textAction" onClick={onEdit}>Update property facts</button></div>
    {notice && <p role="status" className="muted">{notice}</p>}
  </div>
}
