'use client'
import { useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TaxAmountInput } from './TaxAmountInput'
import { emptyPropertyExpense, propertyExpensePayload, PROPERTY_EXPENSE_CATEGORIES } from '../../lib/tax-center/expense-entry'
import { beginReadingFileBytes, toDurableUploadableFile } from '../../lib/uploads/durable-file'
import { uploadReceiptDocument } from '../../lib/documents/upload-receipt'
import { toSafeErrorMessage } from '../../lib/user-facing-errors'

export function PropertyExpenseEntry({ client, ownerId, propertyId, onSaved, onScanReceipt, year }: {
  year: string; client: SupabaseClient; ownerId: string; propertyId: string; onSaved: () => void; onScanReceipt?: () => void
}) {
  const [draft, setDraft] = useState(()=>emptyPropertyExpense(year))
  const [receipt, setReceipt] = useState<{file: File; bytes: Promise<ArrayBuffer>} | null>(null)
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [entryKey, setEntryKey] = useState(0)
  const uploadedDocument = useRef<string | null>(null)
  async function save() {
    if (saving) return
    setError(''); setNotice('')
    try { propertyExpensePayload(draft, propertyId, ownerId, null) } catch(error) { setError(error instanceof Error ? error.message : 'Check your entry.'); return }
    setSaving(true)
    try {
      if (receipt && !uploadedDocument.current) {
        const durable = await toDurableUploadableFile(receipt.file, receipt.file.type || undefined, receipt.bytes)
        const result = await uploadReceiptDocument(ownerId, propertyId, durable.file, {
          uploadFile: async (path, file, contentType) => { const {error} = await client.storage.from('property-documents').upload(path,file,{contentType,upsert:false}); return {error:error?.message || null} },
          insertDocumentRow: async row => { const {data,error} = await client.from('property_documents').insert(row).select('id').single(); return {id:data?.id || null,error:error?.message || null} },
          removeFile: async path => { await client.storage.from('property-documents').remove([path]) },
        })
        if (!result.ok) throw new Error(result.error)
        uploadedDocument.current = result.documentId
      }
      const {error} = await client.from('financial_transactions').insert(propertyExpensePayload(draft,propertyId,ownerId,uploadedDocument.current))
      if (error) { setError(toSafeErrorMessage(error,'Unable to save this expense. Your entry is still here.')); return }
      const next = emptyPropertyExpense(year)
      setDraft({...next, category:draft.category, date:draft.date})
      setEntryKey(key=>key+1); setReceipt(null); uploadedDocument.current=null
      setNotice('Expense saved. Add another whenever you’re ready.')
      onSaved()
    } catch(error) { setError(toSafeErrorMessage(error,'Unable to save. Your entry is still here. Please try again.')) }
    finally { setSaving(false) }
  }
  return <section className="propertyExpenseBox" aria-label="Add property expense">
    <div className="propertyExpenseTitle"><div><h3>Add an expense</h3><p>Save each payment as you go.</p></div>{onScanReceipt && <button type="button" className="secondary compactAction" disabled={saving} onClick={onScanReceipt}>Scan receipt</button>}</div>
    <fieldset disabled={saving} className="propertyExpenseFields">
      <label>Category<select value={draft.category} onChange={event=>setDraft(d=>({...d,category:event.target.value}))}>{PROPERTY_EXPENSE_CATEGORIES.map(category=><option key={category} value={category}>{category === 'Taxes' ? 'Property taxes' : category === 'CapEx' ? 'Capital improvements' : category}</option>)}</select></label>
      <label>Amount<TaxAmountInput key={entryKey} label="New expense amount" value={draft.amount} onChange={amount=>setDraft(d=>({...d,amount}))} /></label>
      <label>Date<input type="date" value={draft.date} onChange={event=>setDraft(d=>({...d,date:event.target.value}))} /></label>
      <label className="propertyExpenseNote">Note (optional)<input value={draft.note} onChange={event=>setDraft(d=>({...d,note:event.target.value}))} placeholder="What was this for?" /></label>
    </fieldset>
    <div className="propertyExpenseFooter"><label className="secondary compactAction receiptAttach">{receipt ? receipt.file.name : 'Attach receipt'}<input type="file" accept="image/*,.pdf,application/pdf" disabled={saving} onChange={event=>{const file=event.currentTarget.files?.[0]; if(file){setReceipt({file,bytes:beginReadingFileBytes(file)});uploadedDocument.current=null} event.currentTarget.value=''}} /></label>
      {receipt && <button type="button" className="textAction" disabled={saving} onClick={()=>{setReceipt(null);uploadedDocument.current=null}}>Remove</button>}
      <button type="button" className="primary compactAction" disabled={saving || !draft.amount.trim()} onClick={()=>void save()}>{saving?'Saving…':'Save expense'}</button></div>
    {error && <p className="errorMessage" role="alert">{error}</p>}{notice && <p className="propertyExpenseNotice" role="status">{notice}</p>}
  </section>
}
