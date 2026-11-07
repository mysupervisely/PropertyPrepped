import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { sendTenantConnectEmail } from '../../../../lib/tenant-connect/notify'
import { receiptText, type RentReceipt } from '../../../../lib/rent-payments/workflow'
export const runtime='nodejs'
export async function POST(req:NextRequest) {
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
 if(!token)return NextResponse.json({sent:false},{status:401})
 const client=createRequestClient(token)
 if(!client)return NextResponse.json({sent:false},{status:503})
 const {data:auth}=await client.auth.getUser()
 if(!auth.user)return NextResponse.json({sent:false},{status:401})
 const body=await req.json().catch(()=>({}))
 if(typeof body.paymentId!=='string'||! /^[0-9a-f-]{36}$/i.test(body.paymentId))return NextResponse.json({sent:false},{status:400})
 // Explicit owner scope: tenant read access to a receipt never grants sending.
 const {data:payment}=await client.from('rent_payments').select('id').eq('id',body.paymentId).eq('owner_id',auth.user.id).maybeSingle()
 if(!payment)return NextResponse.json({sent:false},{status:404})
 const {data,error}=await client.rpc('prepare_rent_payment_receipt',{p_payment_id:payment.id})
 if(error||!data)return NextResponse.json({sent:false,message:'Unable to prepare receipt.'},{status:500})
 const receipt=data as RentReceipt
 if(receipt.emailed_at)return NextResponse.json({sent:false,alreadySent:true})
 const {data:lease}=await client.from('leases').select('tenant_email').eq('id',receipt.lease_id).eq('owner_id',auth.user.id).maybeSingle()
 if(!lease?.tenant_email)return NextResponse.json({sent:false,message:'Receipt is ready. Add the tenant’s email to the lease to send it.'})
 const result=await sendTenantConnectEmail(lease.tenant_email,{subject:'Your rent receipt from PropRoster',body:receiptText(receipt)},process.env,`rent-receipt/${payment.id}`)
 if(result.sent) await client.from('rent_payment_receipts').update({emailed_at:new Date().toISOString()}).eq('payment_id',payment.id).eq('owner_id',auth.user.id)
 return NextResponse.json({...result,message:result.sent?'Receipt emailed.':'Receipt is available in the portal. Email could not be sent.'})
}
