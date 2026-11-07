import {beforeEach,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
const {createRequestClient,sendTenantConnectEmail}=vi.hoisted(()=>({createRequestClient:vi.fn(),sendTenantConnectEmail:vi.fn()}))
vi.mock('../../../../lib/supabase-server',()=>({createRequestClient}))
vi.mock('../../../../lib/tenant-connect/notify',()=>({sendTenantConnectEmail}))
import {POST} from './route'
const id='11111111-1111-4111-8111-111111111111'
function request(token=true){return new NextRequest('https://example.test/api/rent-payments/receipt',{method:'POST',headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer test'}:{})},body:JSON.stringify({paymentId:id,to:'attacker@example.invalid'})})}
beforeEach(()=>vi.clearAllMocks())
it('requires a signed-in caller',async()=>{expect((await POST(request(false))).status).toBe(401);expect(sendTenantConnectEmail).not.toHaveBeenCalled()})
it('never allows a tenant or unrelated caller to email a receipt',async()=>{
 const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null})}
 createRequestClient.mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'tenant'}}})},from:()=>q})
 expect((await POST(request())).status).toBe(404)
 expect(q.eq).toHaveBeenCalledWith('owner_id','tenant');expect(sendTenantConnectEmail).not.toHaveBeenCalled()
})
it('uses the lease recipient, not a caller-supplied email, with an idempotency key',async()=>{
 const q={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValueOnce({data:{id}}).mockResolvedValueOnce({data:{tenant_email:'tenant@example.invalid'}}),update:vi.fn().mockReturnThis()}
 createRequestClient.mockReturnValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:'owner'}}})},from:()=>q,rpc:vi.fn().mockResolvedValue({data:{payment_id:id,lease_id:'lease',tenant_name:'Test',property_address:'Test property',amount:1000,rent_period:'2026-11-01',date_received:'2026-11-07',payment_method:'Zelle',emailed_at:null}})})
 sendTenantConnectEmail.mockResolvedValue({sent:true})
 expect((await POST(request())).status).toBe(200)
 expect(sendTenantConnectEmail.mock.calls[0][0]).toBe('tenant@example.invalid')
 expect(sendTenantConnectEmail.mock.calls[0][3]).toBe(`rent-receipt/${id}`)
})
