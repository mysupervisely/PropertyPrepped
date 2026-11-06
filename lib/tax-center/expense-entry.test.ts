import {it,expect} from 'vitest'
import {emptyPropertyExpense,propertyExpensePayload} from './expense-entry'
import {sumByCategory} from './aggregate'

it('records taxes and utilities as separate incremental payments, with linked receipts',()=>{
  const draft={category:'Taxes',amount:'5,000',date:'2026-11-05',note:'County bill'}
  const first=propertyExpensePayload(draft,'property','owner','receipt')
  const second=propertyExpensePayload({...draft,category:'Utilities',amount:'75.25',note:''},'property','owner',null)
  expect(first).toMatchObject({amount:5000,category:'Taxes',document_id:'receipt',property_id:'property',owner_id:'owner'})
  expect(second).toMatchObject({amount:75.25,category:'Utilities',description:'Utilities'})
  expect(sumByCategory([first,second].map((row,index)=>({...row,id:String(index)})))).toMatchObject({Taxes:5000,Utilities:75.25})
  expect(emptyPropertyExpense().amount).toBe('')
})

it('rejects missing, invalid and non-positive amounts before saving',()=>{
 for(const amount of ['', '0', '-5', '.', 'abc']) expect(()=>propertyExpensePayload({category:'Taxes',amount,date:'2026-11-05',note:''},'p','o',null)).toThrow('amount')
})
it('rejects arbitrary categories and missing dates',()=>{
 expect(()=>propertyExpensePayload({category:'Fake',amount:'25',date:'2026-11-05',note:''},'p','o',null)).toThrow('category')
 expect(()=>propertyExpensePayload({category:'Taxes',amount:'25',date:'',note:''},'p','o',null)).toThrow('date')
})

it('requires an explicit date when adding an expense to a previous tax year',()=>{expect(emptyPropertyExpense('1999').date).toBe('')})
