import {it,expect,vi,afterEach} from 'vitest'
import {buildProviderOutreachEmail} from './provider-outreach'
import {sendTenantConnectEmail} from '../tenant-connect/notify'
afterEach(()=>vi.unstubAllGlobals())
it('sends the PropCrew request as email with a response link, using simulated delivery only',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,status:200});vi.stubGlobal('fetch',fetch)
 const email=buildProviderOutreachEmail({providerFirstName:'Test',landlordName:'Owner',propertyAddress:'Test property',issueTitle:'Leaking faucet',reviewUrl:'https://example.com/provider/test-token'})
 expect(await sendTenantConnectEmail('provider@example.com',email,{RESEND_API_KEY:'test-only',TENANT_CONNECT_FROM_EMAIL:'hello@example.com'})).toEqual({sent:true})
 expect(fetch).toHaveBeenCalledTimes(1)
 const [url,request]=fetch.mock.calls[0];expect(url).toBe('https://api.resend.com/emails')
 const payload=JSON.parse(request.body);expect(payload.to).toBe('provider@example.com');expect(payload.text).toContain('https://example.com/provider/test-token');expect(payload.text).toContain('Leaking faucet')
})
it('reports unconfigured email without attempting a delivery',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 expect(await sendTenantConnectEmail('provider@example.com',{subject:'Test',body:'Test'},{})).toEqual({sent:false,reason:'not_configured'})
 expect(fetch).not.toHaveBeenCalled()
})
