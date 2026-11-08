'use client'

import { useState } from 'react'

export function PublicPropertyRecords({ address, city, onEdit }: { address: string; city: string; onEdit: () => void }) {
  const [notice, setNotice] = useState('')
  const florida = /(?:^|[,\s])(?:FL|Florida)(?:\s|$|,)/i.test(city)
  const directoryUrl = florida ? 'https://floridarevenue.com/property/Pages/LocalOfficials.aspx' : 'https://www.usa.gov/local-governments'
  return <section className="overviewInfoSection publicPropertyRecords">
    <div className="publicPropertyRecordsHeading"><h3>Public property records</h3><a className="textAction" href={directoryUrl} target="_blank" rel="noopener noreferrer">Find local records</a></div>
    <p className="muted">Official assessor records · All 50 states. Records are not automatically imported.</p>
    <details><summary>What can I find?</summary>
    <p className="muted">Find your local assessor or property appraiser in any U.S. state. Choose your state, then your county or municipality. Available details can include building facts, lot size, recorded sales, assessments and exemptions.</p>
    <p className="muted">Tax assessments and current resale estimates are different.</p>
    <div className="publicPropertyRecordsActions"><button type="button" className="textAction" onClick={async () => { try { await navigator.clipboard.writeText([address, city].filter(Boolean).join(', ')); setNotice('Address copied. Paste it into the local property search.') } catch { setNotice([address, city].filter(Boolean).join(', ')) } }}>Copy property address</button><button type="button" className="textAction" onClick={onEdit}>Update property facts</button></div>
    {notice && <p role="status" className="muted">{notice}</p>}
    </details>
  </section>
}
