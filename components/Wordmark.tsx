import Image from 'next/image'

// Shared PropRoster identity. Keep the supplied roof/list artwork unchanged.
// The image is decorative because the adjacent text supplies the brand name.
export function Wordmark() {
  return (
    <span className="wordmarkLockup">
      <Image className="wordmarkIcon" src="/proproster-logo.png" width={40} height={40} alt="" aria-hidden="true" />
      <span className="wordmarkText"><span className="wordmarkProp">Prop</span><span className="wordmarkRoster">Roster</span></span>
    </span>
  )
}
