import {it,expect} from 'vitest'
import type {SupabaseClient} from '@supabase/supabase-js'
import {confirmItemProperty,saveReceiptRecord} from './engine'
function client(responses:Record<string,unknown>) {
 const inserts:Record<string,unknown>[]=[]; const updates:unknown[][]=[]
 return {inserts,updates,db:{from:(table:string)=>{
   const chain:Record<string,unknown>={}
   for(const method of ['eq','select','single'])chain[method]=()=>chain
   chain.insert=(payload:Record<string,unknown>)=>{inserts.push({table,...payload});return chain}
   chain.update=(payload:unknown)=>{updates.push([table,payload]);return chain}
   chain.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(responses[table]??{data:null,error:null}).then(resolve)
   return chain
 }} as unknown as SupabaseClient}
}
it('files a confirmed receipt to the selected property and category once',async()=>{
 const fake=client({financial_transactions:{data:{id:'tx'},error:null}})
 await confirmItemProperty(fake.db,'doc','item','property')
 const args={itemId:'item',documentId:'doc',confirmedPropertyId:'property',createdFinancialTransactionId:null,createdMaintenanceRecordId:null,vendor:'Electric company',date:'2026-11-05',amount:'75',description:'Electric bill',financialCategory:'Utilities',createMaintenanceRecord:false,maintenanceCategory:'General',contactId:null,systemId:null}
 const result=await saveReceiptRecord(fake.db,'owner',args)
 expect(result.ok).toBe(true)
 expect(fake.inserts).toContainEqual(expect.objectContaining({table:'financial_transactions',owner_id:'owner',property_id:'property',category:'Utilities',amount:75,document_id:'doc'}))
 expect(fake.updates).toContainEqual(['property_documents',{category:'Receipts'}])
 await saveReceiptRecord(fake.db,'owner',{...args,createdFinancialTransactionId:'tx'})
 expect(fake.inserts.filter(row=>row.table==='financial_transactions')).toHaveLength(1)
})
it('does not silently confirm a property when filing fails',async()=>{
 const fake=client({property_documents:{data:null,error:{message:'not allowed'}}})
 await expect(confirmItemProperty(fake.db,'doc','item','property')).rejects.toThrow('confirm the property')
})
