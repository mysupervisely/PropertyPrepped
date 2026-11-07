'use client'
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RENT_PAYMENT_METHODS } from '../../lib/property-categories'
import { evidenceBucket, evidenceType, localDate, money, paymentAmount } from '../../lib/rent-payments/workflow'
import { RentReceiptButton } from './RentReceiptButton'
type Report = {id:string;lease_id:string;reported_by:string;rent_period:string;paid_on:string;amount:number;payment_method:string;reference_number:string|null;status:string;payment_id:string|null;evidence_path:string|null;leases?:{tenant_name:string}}
export function RentPaymentReports({client,tenant=false,leaseId,propertyId,monthlyRent=0,onChanged}:{client:SupabaseClient;tenant?:boolean;leaseId?:string;propertyId?:string;monthlyRent?:number;onChanged?:()=>void}) {
 const [reports,setReports]=useState<Report[]>([]),[open,setOpen]=useState(false),[amount,setAmount]=useState(String(monthlyRent||'')),[month,setMonth]=useState(localDate().slice(0,7)),[paidOn,setPaidOn]=useState(localDate()),[method,setMethod]=useState('Zelle'),[reference,setReference]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[sendReceipt,setSendReceipt]=useState(false),[income,setIncome]=useState(true)
 async function load() {
  let query=client.from('rent_payment_reports').select(tenant?'*':'*,leases!inner(tenant_name,property_id)')
  if(tenant&&leaseId) query=query.eq('lease_id',leaseId)
  if(!tenant) query=query.eq('status','Reported')
  if(!tenant&&propertyId) query=query.eq('leases.property_id',propertyId)
  const {data,error}=await query.order('created_at',{ascending:false}).limit(30)
  if(error) {setNotice('Payment reports could not load. Please refresh.');return}
  setReports((data||[]) as unknown as Report[])
 }
 useEffect(()=>{
  void load()
  const refresh=()=>{if(!document.hidden)void load()}
  window.addEventListener('focus',refresh)
  document.addEventListener('visibilitychange',refresh)
  const timer=window.setInterval(refresh,60000)
  return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.clearInterval(timer)}
 },[leaseId,propertyId,tenant])
 async function report() {
  if(!leaseId)return
  setNotice('');let value:number;let type=''
  try {value=paymentAmount(amount);if(file)type=evidenceType(file);if(!/^\d{4}-\d{2}$/.test(month)||!paidOn)throw Error('Choose the rent month and payment date.')}catch(e){setNotice(e instanceof Error?e.message:'Check the payment details.');return}
  setBusy(true)
  try {
   const {data:auth}=await client.auth.getUser();if(!auth.user)throw Error('Please sign in again.')
   const {data:row,error}=await client.from('rent_payment_reports').insert({lease_id:leaseId,reported_by:auth.user.id,rent_period:month+'-01',paid_on:paidOn,amount:value,payment_method:method,reference_number:reference.trim()||null}).select('id').single()
   if(error)throw Error(error.code==='23505'?'You already have a report awaiting confirmation for this month.':'Unable to submit. Check your reports before retrying.')
   let attachmentFailed=false
   if(file){try {const path=`${auth.user.id}/${leaseId}/${row.id}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase()}`;const result=await client.storage.from(evidenceBucket).upload(path,file,{contentType:type,upsert:false});if(result.error)throw result.error;const updated=await client.from('rent_payment_reports').update({evidence_path:path}).eq('id',row.id).select('id').single();if(updated.error)throw updated.error}catch{attachmentFailed=true}}
   setOpen(false);setFile(null);setReference('');setNotice(attachmentFailed?'Payment reported. The attachment could not be saved; contact your landlord to share it.':'Payment reported. Your landlord will confirm when it is received.');await load();onChanged?.()
  }catch(e){setNotice(e instanceof Error?e.message:'Unable to report payment.')}finally{setBusy(false)}
 }
 async function review(r:Report,confirm:boolean){setBusy(true);setNotice('');try {
  if(!confirm){const result=await client.from('rent_payment_reports').update({status:'Dismissed'}).eq('id',r.id).eq('status','Reported').select('id').single();if(result.error)throw result.error;setNotice('Report dismissed. No payment was recorded.')}
  else {const result=await client.rpc('confirm_rent_payment_report',{p_report_id:r.id,p_record_income:income});if(result.error)throw result.error;const receipt=await client.rpc('prepare_rent_payment_receipt',{p_payment_id:result.data});let message=receipt.error?'Payment confirmed. You can create the receipt from payment history.':'Payment confirmed. Receipt is available to the tenant.';if(sendReceipt){try {const {data}=await client.auth.getSession();const response=await fetch('/api/rent-payments/receipt',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({paymentId:result.data})});const email=await response.json();message=email.sent?'Payment confirmed and receipt emailed.':'Payment confirmed. Email was not sent; use Receipt to retry.'}catch{message='Payment confirmed. Email could not be confirmed; use Receipt to retry.'}}setNotice(message)}
  await load();onChanged?.()
 }catch{setNotice('Unable to complete this action. Refresh before retrying.')}finally{setBusy(false)}}
 if(!tenant && !reports.length && !notice) return null
 return <section className="rentWorkflow"><div className="rentWorkflowHead"><h3>{tenant?'Report a payment':'Payments awaiting confirmation'}</h3>{tenant&&<button type="button" className="primary" disabled={busy||!leaseId} onClick={()=>setOpen(v=>!v)}>{open?'Cancel':'I paid'}</button>}<button type="button" className="textAction" disabled={busy} onClick={()=>void load()}>Refresh</button></div>{tenant&&<p className="muted">Pay your usual way. Report it here; only your landlord can confirm receipt.</p>}{open&&<div className="rentWorkflowForm"><label>Rent month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><label>Amount<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Date paid<input type="date" value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></label><label>Method<select value={method} onChange={e=>setMethod(e.target.value)}>{RENT_PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></label><label>Reference (optional)<input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Confirmation photo / PDF (optional)<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" onChange={e=>{const next=e.target.files?.[0];if(next){try{evidenceType(next);setFile(next)}catch(err){setFile(null);setNotice(err instanceof Error?err.message:'Invalid file');e.target.value=''}}}}/></label><button type="button" className="primary" disabled={busy} onClick={()=>void report()}>{busy?'Submitting…':'Report payment'}</button></div>}{!tenant&&reports.length>0&&<div className="rentWorkflowOptions"><label><input type="checkbox" checked={income} onChange={e=>setIncome(e.target.checked)}/> Also record as rental income (uncheck if already logged)</label><label><input type="checkbox" checked={sendReceipt} onChange={e=>setSendReceipt(e.target.checked)}/> Email tenant a receipt when I confirm</label></div>}{reports.map(r=><article className="rentReport" key={r.id}><div><strong>{money(r.amount)} · {r.rent_period.slice(0,7)}</strong><p>{r.leases?.tenant_name}{r.leases?.tenant_name?' · ':''}{r.payment_method} · {r.paid_on}</p>{r.reference_number&&<small>Ref: {r.reference_number}</small>}</div><span className="statusPill">{r.status==='Reported'?'Payment reported':r.status==='Confirmed'&&!r.payment_id?'Payment record removed':r.status}</span>{r.evidence_path&&<button type="button" className="textAction" onClick={async()=>{const result=await client.storage.from(evidenceBucket).createSignedUrl(r.evidence_path!,60);if(result.error||!result.data?.signedUrl){setNotice('Attachment unavailable.');return}window.location.assign(result.data.signedUrl)}}>View attachment</button>}{!tenant&&<div className="rentWorkflowActions"><button type="button" className="primary" disabled={busy} onClick={()=>void review(r,true)}>Confirm received</button><button type="button" className="secondary" disabled={busy} onClick={()=>{if(window.confirm('Dismiss this report? Use this if it was already recorded or no payment was received.'))void review(r,false)}}>Dismiss</button></div>}{tenant&&r.status==='Confirmed'&&r.payment_id&&<RentReceiptButton client={client} paymentId={r.payment_id}/>}</article>)}{!tenant&&!reports.length&&<p className="muted">No reports waiting for confirmation.</p>}{notice&&<p role="status" className="rentWorkflowNotice">{notice}</p>}</section>
}
