'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type Property = {
  id: string
  owner_id: string
  address: string
  city: string
  property_type: string
  estimated_value: number
  mortgage_balance: number
  monthly_rent: number
  purchase_price: number
  monthly_expenses: number
  cover_photo_path: string | null
  coverUrl?: string
}

type PropertyDocument = {
  id: string
  property_id: string
  owner_id: string
  name: string
  category: string
  storage_path: string
  size_bytes: number
  mime_type: string | null
  created_at: string
}

type PropertyPhoto = {
  id: string
  property_id: string
  owner_id: string
  name: string
  storage_path: string
  is_cover: boolean
  created_at: string
  signedUrl?: string
}

type FinancialTransaction = {
  id: string
  property_id: string
  owner_id: string
  transaction_date: string
  transaction_type: 'Income' | 'Expense'
  category: string
  vendor: string | null
  description: string
  amount: number
  document_id: string | null
  is_recurring: boolean
  created_at: string
}



type LeaseRecord = {
  id: string; property_id: string; owner_id: string; tenant_name: string; tenant_email: string | null; monthly_rent: number; security_deposit: number; start_date: string; end_date: string; renewal_status: string; document_id: string | null; notes: string | null; created_at: string
}

type MortgageRecord = {
  id: string; property_id: string; owner_id: string; lender: string; loan_number: string | null; original_balance: number; current_balance: number; interest_rate: number; monthly_payment: number; escrow_amount: number; loan_term_years: number | null; maturity_date: string | null; document_id: string | null; created_at: string
}

type InsuranceRecord = {
  id: string; property_id: string; owner_id: string; carrier: string; policy_number: string | null; annual_premium: number; deductible: number; effective_date: string | null; expiration_date: string | null; document_id: string | null; created_at: string
}

type MaintenanceRecord = {
  id: string; property_id: string; owner_id: string; service_date: string; status: string; category: string; vendor: string | null; description: string; cost: number; document_id: string | null; financial_transaction_id: string | null; created_at: string
}

type Tab = 'Overview' | 'Documents' | 'Photos' | 'Financials' | 'Lease' | 'Maintenance' | 'Mortgage' | 'Insurance'

const tabs: Tab[] = ['Overview', 'Documents', 'Photos', 'Financials', 'Lease', 'Maintenance', 'Mortgage', 'Insurance']
const docCategories = ['All', 'Closing', 'Mortgage', 'Insurance', 'Lease', 'Tax', 'Inspection', 'Receipts', 'Warranties', 'Other']
const financialCategories = ['Rent', 'Other Income', 'Mortgage', 'Taxes', 'Insurance', 'HOA', 'Utilities', 'Repairs', 'Maintenance', 'CapEx', 'Management', 'Legal & Professional', 'Supplies', 'Other']

const money = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(n || 0)

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')


function EmptyModule({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <div className="emptyModule"><strong>{title}</strong><span>{text}</span><button className="primary" onClick={onClick}>+ {action}</button></div>
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [properties, setProperties] = useState<Property[]>([])
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [photos, setPhotos] = useState<PropertyPhoto[]>([])
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [leases, setLeases] = useState<LeaseRecord[]>([])
  const [mortgages, setMortgages] = useState<MortgageRecord[]>([])
  const [insurancePolicies, setInsurancePolicies] = useState<InsuranceRecord[]>([])
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [showTransaction, setShowTransaction] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState<'Lease'|'Mortgage'|'Insurance'|'Maintenance'|null>(null)
  const [leaseDraft, setLeaseDraft] = useState({ tenantName:'', tenantEmail:'', monthlyRent:'', securityDeposit:'', startDate:new Date().toISOString().slice(0,10), endDate:'', renewalStatus:'Active', documentId:'', notes:'' })
  const [mortgageDraft, setMortgageDraft] = useState({ lender:'', loanNumber:'', originalBalance:'', currentBalance:'', interestRate:'', monthlyPayment:'', escrowAmount:'', loanTermYears:'30', maturityDate:'', documentId:'' })
  const [insuranceDraft, setInsuranceDraft] = useState({ carrier:'', policyNumber:'', annualPremium:'', deductible:'', effectiveDate:'', expirationDate:'', documentId:'' })
  const [maintenanceDraft, setMaintenanceDraft] = useState({ serviceDate:new Date().toISOString().slice(0,10), status:'Completed', category:'Repair', vendor:'', description:'', cost:'', documentId:'', addToFinancials:true })
  const [financialYear, setFinancialYear] = useState(String(new Date().getFullYear()))
  const [transactionDraft, setTransactionDraft] = useState({ date: new Date().toISOString().slice(0, 10), type: 'Expense' as 'Income' | 'Expense', category: 'Repairs', vendor: '', description: '', amount: '', documentId: '', recurring: false })
  const [showAdd, setShowAdd] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [docCategory, setDocCategory] = useState('All')
  const [uploadCategory, setUploadCategory] = useState('Other')
  const [isDragging, setIsDragging] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [draft, setDraft] = useState({
    address: '', city: '', type: 'Rental Property', value: '', mortgage: '', rent: '', purchasePrice: '', monthlyExpenses: '',
  })

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setSelectedId(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) void loadPortfolio()
    else {
      setProperties([])
      setDocuments([])
      setPhotos([])
      setTransactions([])
      setLeases([])
      setMortgages([])
      setInsurancePolicies([])
      setMaintenanceRecords([])
    }
  }, [user?.id])

  const totals = useMemo(() => {
    const value = properties.reduce((sum, p) => sum + Number(p.estimated_value), 0)
    const debt = properties.reduce((sum, p) => sum + Number(p.mortgage_balance), 0)
    const rent = properties.reduce((sum, p) => sum + Number(p.monthly_rent), 0)
    const year = String(new Date().getFullYear())
    const ytd = transactions.filter((tx) => tx.transaction_date.startsWith(year))
    const income = ytd.filter((tx) => tx.transaction_type === 'Income').reduce((sum, tx) => sum + Number(tx.amount), 0)
    const expenses = ytd.filter((tx) => tx.transaction_type === 'Expense').reduce((sum, tx) => sum + Number(tx.amount), 0)
    return { value, debt, equity: value - debt, rent, income, expenses, cashFlow: income - expenses }
  }, [properties, transactions])

  const selected = properties.find((property) => property.id === selectedId) || null
  const selectedDocs = documents.filter((doc) => doc.property_id === selectedId)
  const filteredDocs = docCategory === 'All' ? selectedDocs : selectedDocs.filter((doc) => doc.category === docCategory)
  const selectedPhotos = photos.filter((photo) => photo.property_id === selectedId)
  const selectedTransactions = transactions.filter((tx) => tx.property_id === selectedId)
  const selectedYearTransactions = selectedTransactions.filter((tx) => tx.transaction_date.startsWith(financialYear))
  const selectedLeases = leases.filter((row) => row.property_id === selectedId)
  const selectedMortgages = mortgages.filter((row) => row.property_id === selectedId)
  const selectedInsurance = insurancePolicies.filter((row) => row.property_id === selectedId)
  const selectedMaintenance = maintenanceRecords.filter((row) => row.property_id === selectedId)

  async function loadPortfolio() {
    if (!supabase || !user) return
    const client = supabase
    setBusy(true)
    setError('')
    const [{ data: propertyRows, error: propertyError }, { data: docRows, error: docError }, { data: photoRows, error: photoError }, { data: transactionRows, error: transactionError }, { data: leaseRows, error: leaseError }, { data: mortgageRows, error: mortgageError }, { data: insuranceRows, error: insuranceError }, { data: maintenanceRows, error: maintenanceError }] = await Promise.all([
      client.from('properties').select('*').order('created_at', { ascending: true }),
      client.from('property_documents').select('*').order('created_at', { ascending: false }),
      client.from('property_photos').select('*').order('created_at', { ascending: false }),
      client.from('financial_transactions').select('*').order('transaction_date', { ascending: false }),
      client.from('leases').select('*').order('created_at', { ascending: false }),
      client.from('mortgages').select('*').order('created_at', { ascending: false }),
      client.from('insurance_policies').select('*').order('created_at', { ascending: false }),
      client.from('maintenance_records').select('*').order('service_date', { ascending: false }),
    ])
    const firstError = propertyError || docError || photoError || transactionError || leaseError || mortgageError || insuranceError || maintenanceError
    if (firstError) {
      setError(firstError.message)
      setBusy(false)
      return
    }

    const rawProperties = (propertyRows || []) as Property[]
    const rawPhotos = (photoRows || []) as PropertyPhoto[]
    const signedPhotos = await Promise.all(rawPhotos.map(async (photo) => {
      const { data } = await client.storage.from('property-photos').createSignedUrl(photo.storage_path, 3600)
      return { ...photo, signedUrl: data?.signedUrl }
    }))
    const coverMap = new Map(signedPhotos.filter((p) => p.is_cover).map((p) => [p.property_id, p.signedUrl]))
    setProperties(rawProperties.map((p) => ({ ...p, coverUrl: coverMap.get(p.id) })))
    setDocuments((docRows || []) as PropertyDocument[])
    setPhotos(signedPhotos)
    setTransactions((transactionRows || []) as FinancialTransaction[])
    setLeases((leaseRows || []) as LeaseRecord[])
    setMortgages((mortgageRows || []) as MortgageRecord[])
    setInsurancePolicies((insuranceRows || []) as InsuranceRecord[])
    setMaintenanceRecords((maintenanceRows || []) as MaintenanceRecord[])
    setBusy(false)
  }

  async function submitAuth() {
    if (!supabase || !email.trim() || password.length < 6) return
    setBusy(true)
    setAuthMessage('')
    setError('')
    if (authMode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) setError(signInError.message)
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password })
      if (signUpError) setError(signUpError.message)
      else if (!data.session) setAuthMessage('Account created. Check your email to confirm your address, then sign in.')
    }
    setBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const handleImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  async function addProperty() {
    if (!supabase || !user || !draft.address.trim() || !draft.city.trim()) return
    setBusy(true)
    setError('')
    const { data: inserted, error: insertError } = await supabase.from('properties').insert({
      owner_id: user.id,
      address: draft.address.trim(),
      city: draft.city.trim(),
      property_type: draft.type,
      estimated_value: Number(draft.value || 0),
      mortgage_balance: Number(draft.mortgage || 0),
      monthly_rent: Number(draft.rent || 0),
      purchase_price: Number(draft.purchasePrice || 0),
      monthly_expenses: Number(draft.monthlyExpenses || 0),
    }).select('*').single()

    if (insertError || !inserted) {
      setError(insertError?.message || 'Unable to add property.')
      setBusy(false)
      return
    }

    if (coverFile) {
      const path = `${user.id}/${inserted.id}/photos/${crypto.randomUUID()}-${safeName(coverFile.name)}`
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, coverFile, { contentType: coverFile.type, upsert: false })
      if (!uploadError) {
        await supabase.from('property_photos').insert({ owner_id: user.id, property_id: inserted.id, name: coverFile.name, storage_path: path, is_cover: true })
        await supabase.from('properties').update({ cover_photo_path: path }).eq('id', inserted.id)
      }
    }

    setDraft({ address: '', city: '', type: 'Rental Property', value: '', mortgage: '', rent: '', purchasePrice: '', monthlyExpenses: '' })
    setCoverFile(null)
    setImagePreview('')
    setShowAdd(false)
    await loadPortfolio()
    setBusy(false)
  }

  const openProperty = (id: string, tab: Tab = 'Overview') => {
    setSelectedId(id)
    setActiveTab(tab)
    setDocCategory('All')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function addDocumentFiles(files: FileList | File[]) {
    if (!supabase || !user || !selectedId) return
    const incoming = Array.from(files)
    if (!incoming.length) return
    setBusy(true)
    setError('')
    for (const file of incoming) {
      const path = `${user.id}/${selectedId}/documents/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (uploadError) {
        setError(uploadError.message)
        continue
      }
      const { error: rowError } = await supabase.from('property_documents').insert({
        owner_id: user.id, property_id: selectedId, name: file.name, category: uploadCategory,
        storage_path: path, size_bytes: file.size, mime_type: file.type || null,
      })
      if (rowError) {
        await supabase.storage.from('property-documents').remove([path])
        setError(rowError.message)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }

  async function addPhotoFiles(files: FileList | File[]) {
    if (!supabase || !user || !selectedId) return
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!incoming.length) return
    setBusy(true)
    setError('')
    const hasCover = selectedPhotos.some((photo) => photo.is_cover)
    for (let index = 0; index < incoming.length; index++) {
      const file = incoming[index]
      const path = `${user.id}/${selectedId}/photos/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setError(uploadError.message)
        continue
      }
      const isCover = !hasCover && index === 0
      const { error: rowError } = await supabase.from('property_photos').insert({ owner_id: user.id, property_id: selectedId, name: file.name, storage_path: path, is_cover: isCover })
      if (rowError) {
        await supabase.storage.from('property-photos').remove([path])
        setError(rowError.message)
      } else if (isCover) {
        await supabase.from('properties').update({ cover_photo_path: path }).eq('id', selectedId)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }

  async function openDocument(doc: PropertyDocument) {
    if (!supabase) return
    const { data, error: urlError } = await supabase.storage.from('property-documents').createSignedUrl(doc.storage_path, 60)
    if (urlError || !data?.signedUrl) {
      setError(urlError?.message || 'Unable to open this document.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeDocument(doc: PropertyDocument) {
    if (!supabase) return
    setBusy(true)
    const { error: storageError } = await supabase.storage.from('property-documents').remove([doc.storage_path])
    if (storageError) setError(storageError.message)
    const { error: rowError } = await supabase.from('property_documents').delete().eq('id', doc.id)
    if (rowError) setError(rowError.message)
    await loadPortfolio()
    setBusy(false)
  }

  async function setCover(photo: PropertyPhoto) {
    if (!supabase || !selectedId) return
    setBusy(true)
    await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', selectedId)
    await supabase.from('property_photos').update({ is_cover: true }).eq('id', photo.id)
    await supabase.from('properties').update({ cover_photo_path: photo.storage_path }).eq('id', selectedId)
    await loadPortfolio()
    setBusy(false)
  }

  async function removePhoto(photo: PropertyPhoto) {
    if (!supabase || !selectedId) return
    setBusy(true)
    const wasCover = photo.is_cover
    const { error: storageError } = await supabase.storage.from('property-photos').remove([photo.storage_path])
    if (storageError) setError(storageError.message)
    await supabase.from('property_photos').delete().eq('id', photo.id)
    if (wasCover) {
      const remaining = selectedPhotos.filter((p) => p.id !== photo.id)
      if (remaining[0]) {
        await supabase.from('property_photos').update({ is_cover: true }).eq('id', remaining[0].id)
        await supabase.from('properties').update({ cover_photo_path: remaining[0].storage_path }).eq('id', selectedId)
      } else {
        await supabase.from('properties').update({ cover_photo_path: null }).eq('id', selectedId)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }


  async function addTransaction() {
    if (!supabase || !user || !selectedId || !transactionDraft.description.trim() || Number(transactionDraft.amount) <= 0) return
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('financial_transactions').insert({
      owner_id: user.id,
      property_id: selectedId,
      transaction_date: transactionDraft.date,
      transaction_type: transactionDraft.type,
      category: transactionDraft.category,
      vendor: transactionDraft.vendor.trim() || null,
      description: transactionDraft.description.trim(),
      amount: Number(transactionDraft.amount),
      document_id: transactionDraft.documentId || null,
      is_recurring: transactionDraft.recurring,
    })
    if (insertError) setError(insertError.message)
    else {
      setShowTransaction(false)
      setTransactionDraft({ date: new Date().toISOString().slice(0, 10), type: 'Expense', category: 'Repairs', vendor: '', description: '', amount: '', documentId: '', recurring: false })
      await loadPortfolio()
    }
    setBusy(false)
  }

  async function saveLease() {
    if (!supabase || !user || !selectedId || !leaseDraft.tenantName.trim() || !leaseDraft.endDate) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('leases').insert({ owner_id:user.id, property_id:selectedId, tenant_name:leaseDraft.tenantName.trim(), tenant_email:leaseDraft.tenantEmail.trim()||null, monthly_rent:Number(leaseDraft.monthlyRent||0), security_deposit:Number(leaseDraft.securityDeposit||0), start_date:leaseDraft.startDate, end_date:leaseDraft.endDate, renewal_status:leaseDraft.renewalStatus, document_id:leaseDraft.documentId||null, notes:leaseDraft.notes.trim()||null })
    if (e) setError(e.message); else { setShowModuleForm(null); setLeaseDraft({ tenantName:'', tenantEmail:'', monthlyRent:'', securityDeposit:'', startDate:new Date().toISOString().slice(0,10), endDate:'', renewalStatus:'Active', documentId:'', notes:'' }); await loadPortfolio() }
    setBusy(false)
  }

  async function saveMortgage() {
    if (!supabase || !user || !selectedId || !mortgageDraft.lender.trim()) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('mortgages').insert({ owner_id:user.id, property_id:selectedId, lender:mortgageDraft.lender.trim(), loan_number:mortgageDraft.loanNumber.trim()||null, original_balance:Number(mortgageDraft.originalBalance||0), current_balance:Number(mortgageDraft.currentBalance||0), interest_rate:Number(mortgageDraft.interestRate||0), monthly_payment:Number(mortgageDraft.monthlyPayment||0), escrow_amount:Number(mortgageDraft.escrowAmount||0), loan_term_years:Number(mortgageDraft.loanTermYears||0)||null, maturity_date:mortgageDraft.maturityDate||null, document_id:mortgageDraft.documentId||null })
    if (e) setError(e.message); else { await supabase.from('properties').update({ mortgage_balance:Number(mortgageDraft.currentBalance||0) }).eq('id', selectedId); setShowModuleForm(null); setMortgageDraft({ lender:'', loanNumber:'', originalBalance:'', currentBalance:'', interestRate:'', monthlyPayment:'', escrowAmount:'', loanTermYears:'30', maturityDate:'', documentId:'' }); await loadPortfolio() }
    setBusy(false)
  }

  async function saveInsurance() {
    if (!supabase || !user || !selectedId || !insuranceDraft.carrier.trim()) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('insurance_policies').insert({ owner_id:user.id, property_id:selectedId, carrier:insuranceDraft.carrier.trim(), policy_number:insuranceDraft.policyNumber.trim()||null, annual_premium:Number(insuranceDraft.annualPremium||0), deductible:Number(insuranceDraft.deductible||0), effective_date:insuranceDraft.effectiveDate||null, expiration_date:insuranceDraft.expirationDate||null, document_id:insuranceDraft.documentId||null })
    if (e) setError(e.message); else { setShowModuleForm(null); setInsuranceDraft({ carrier:'', policyNumber:'', annualPremium:'', deductible:'', effectiveDate:'', expirationDate:'', documentId:'' }); await loadPortfolio() }
    setBusy(false)
  }

  async function saveMaintenance() {
    if (!supabase || !user || !selectedId || !maintenanceDraft.description.trim()) return
    setBusy(true); setError('')
    let financialId: string | null = null
    if (maintenanceDraft.addToFinancials && Number(maintenanceDraft.cost) > 0) {
      const { data: tx, error: txError } = await supabase.from('financial_transactions').insert({ owner_id:user.id, property_id:selectedId, transaction_date:maintenanceDraft.serviceDate, transaction_type:'Expense', category:'Maintenance', vendor:maintenanceDraft.vendor.trim()||null, description:maintenanceDraft.description.trim(), amount:Number(maintenanceDraft.cost), document_id:maintenanceDraft.documentId||null, is_recurring:false }).select('id').single()
      if (txError) { setError(txError.message); setBusy(false); return }
      financialId = tx?.id || null
    }
    const { error: e } = await supabase.from('maintenance_records').insert({ owner_id:user.id, property_id:selectedId, service_date:maintenanceDraft.serviceDate, status:maintenanceDraft.status, category:maintenanceDraft.category, vendor:maintenanceDraft.vendor.trim()||null, description:maintenanceDraft.description.trim(), cost:Number(maintenanceDraft.cost||0), document_id:maintenanceDraft.documentId||null, financial_transaction_id:financialId })
    if (e) setError(e.message); else { setShowModuleForm(null); setMaintenanceDraft({ serviceDate:new Date().toISOString().slice(0,10), status:'Completed', category:'Repair', vendor:'', description:'', cost:'', documentId:'', addToFinancials:true }); await loadPortfolio() }
    setBusy(false)
  }

  async function removeModuleRecord(table: 'leases'|'mortgages'|'insurance_policies'|'maintenance_records', id: string, financialTransactionId?: string | null) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from(table).delete().eq('id', id)
    if (e) setError(e.message)
    else { if (financialTransactionId) await supabase.from('financial_transactions').delete().eq('id', financialTransactionId); await loadPortfolio() }
    setBusy(false)
  }

  async function removeTransaction(id: string) {
    if (!supabase) return
    setBusy(true)
    const { error: deleteError } = await supabase.from('financial_transactions').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else await loadPortfolio()
    setBusy(false)
  }

  function exportTransactionsCsv() {
    if (!selected) return
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [['Date','Type','Category','Vendor','Description','Amount','Recurring','Document']]
    selectedYearTransactions.forEach((tx) => {
      const doc = selectedDocs.find((d) => d.id === tx.document_id)
      rows.push([tx.transaction_date, tx.transaction_type, tx.category, tx.vendor || '', tx.description, String(tx.amount), tx.is_recurring ? 'Yes' : 'No', doc?.name || ''])
    })
    const csv = rows.map((row) => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName(selected.address)}-${financialYear}-financials.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCsvLine(line: string) {
    const values: string[] = []
    let current = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i++ }
      else if (char === '"') quoted = !quoted
      else if (char === ',' && !quoted) { values.push(current.trim()); current = '' }
      else current += char
    }
    values.push(current.trim())
    return values
  }

  async function importTransactionsCsv(file: File) {
    if (!supabase || !user || !selectedId) return
    setBusy(true)
    setError('')
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV has no transaction rows.')
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const index = (name: string) => headers.indexOf(name.toLowerCase())
      const payload = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line)
        const typeRaw = cols[index('Type')] || 'Expense'
        const amount = Number((cols[index('Amount')] || '0').replace(/[$,]/g, ''))
        return {
          owner_id: user.id,
          property_id: selectedId,
          transaction_date: cols[index('Date')] || new Date().toISOString().slice(0,10),
          transaction_type: typeRaw.toLowerCase() === 'income' ? 'Income' : 'Expense',
          category: cols[index('Category')] || 'Other',
          vendor: cols[index('Vendor')] || null,
          description: cols[index('Description')] || 'Imported transaction',
          amount,
          document_id: null,
          is_recurring: (cols[index('Recurring')] || '').toLowerCase() === 'yes',
        }
      }).filter((row) => row.amount > 0)
      if (!payload.length) throw new Error('No valid transactions found. Use the exported CSV format for best results.')
      const { error: importError } = await supabase.from('financial_transactions').insert(payload)
      if (importError) throw importError
      await loadPortfolio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import CSV.')
    }
    setBusy(false)
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="authShell">
        <section className="authCard setupCard">
          <p className="eyebrow">PROPPREPPED MILESTONE 5</p>
          <h1>Connect Supabase</h1>
          <p>PropPrepped is ready for persistent accounts, properties and private uploads. Add your project values to <code>.env.local</code>, then run the included <code>supabase/schema.sql</code> for a fresh project, or <code>supabase/milestone-5-property-records.sql</code> if upgrading from Milestone 4.</p>
          <div className="setupCode">NEXT_PUBLIC_SUPABASE_URL=...<br />NEXT_PUBLIC_SUPABASE_ANON_KEY=...</div>
          <p className="muted">A ready-to-copy <code>.env.example</code> is included in the project.</p>
        </section>
      </main>
    )
  }

  if (!authReady) {
    return <main className="authShell"><div className="loadingState">Loading PropPrepped…</div></main>
  }

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <div className="authBrand"><span className="brand">PropPrepped</span><span className="tagline">Your properties. Organized.</span></div>
          <p className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}</p>
          <h1>{authMode === 'signin' ? 'Sign in' : 'Get started'}</h1>
          <p className="authIntro">Your property records, documents and photos stay organized in one private workspace.</p>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} onKeyDown={(e) => e.key === 'Enter' && void submitAuth()} /></label>
          {error && <div className="statusMessage errorMessage">{error}</div>}
          {authMessage && <div className="statusMessage successMessage">{authMessage}</div>}
          <button className="primary authSubmit" disabled={busy} onClick={() => void submitAuth()}>{busy ? 'Working…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
          <button className="authSwitch" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setError(''); setAuthMessage('') }}>
            {authMode === 'signin' ? 'New to PropPrepped? Create an account' : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    )
  }

  if (selected) {
    const monthlyCashFlow = Number(selected.monthly_rent) - Number(selected.monthly_expenses)
    const equity = Number(selected.estimated_value) - Number(selected.mortgage_balance)

    return (
      <main className="shell workspaceShell">
        <header className="topbar">
          <button className="brandButton" onClick={() => setSelectedId(null)}><span className="brand">PropPrepped</span><span className="tagline">Your properties. Organized.</span></button>
          <div className="accountActions"><span>{user.email}</span><button className="secondary" onClick={() => setSelectedId(null)}>← All Properties</button><button className="secondary" onClick={() => void signOut()}>Log out</button></div>
        </header>
        {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

        <section className="propertyHero">
          <div className="heroPhoto">{selected.coverUrl ? <img src={selected.coverUrl} alt={selected.address} /> : <div className="heroPlaceholder"><span>Property photo</span><small>Add photos in the Photos tab</small></div>}</div>
          <div className="heroInfo">
            <p className="eyebrow">{selected.property_type.toUpperCase()}</p><h1>{selected.address}</h1><p className="heroCity">{selected.city}</p>
            <div className="heroMetrics"><div><span>Value</span><strong>{money(selected.estimated_value)}</strong></div><div><span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong></div><div><span>Equity</span><strong>{money(equity)}</strong></div><div><span>Rent</span><strong>{money(selected.monthly_rent)}/mo</strong></div></div>
          </div>
        </section>

        <nav className="tabs" aria-label="Property sections">{tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>

        {activeTab === 'Overview' && <section className="workspaceContent">
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">PROPERTY OVERVIEW</p><h2>At a glance</h2></div></div>
          <div className="overviewGrid">
            <div className="overviewPanel"><h3>Financial snapshot</h3><div className="detailRows">
              <div><span>Purchase price</span><strong>{money(selected.purchase_price)}</strong></div><div><span>Estimated value</span><strong>{money(selected.estimated_value)}</strong></div><div><span>Mortgage balance</span><strong>{money(selected.mortgage_balance)}</strong></div><div><span>Estimated equity</span><strong>{money(equity)}</strong></div><div><span>Monthly rent</span><strong>{money(selected.monthly_rent)}</strong></div><div><span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong></div><div className="highlightRow"><span>Estimated cash flow</span><strong>{money(monthlyCashFlow)}/mo</strong></div>
            </div></div>
            <div className="overviewPanel"><h3>Property file</h3><div className="fileSummary"><button onClick={() => setActiveTab('Documents')}><strong>{selectedDocs.length}</strong><span>Documents</span><small>Closing, insurance, taxes and more</small></button><button onClick={() => setActiveTab('Photos')}><strong>{selectedPhotos.length}</strong><span>Photos</span><small>Property gallery and records</small></button><button onClick={() => setActiveTab('Maintenance')}><strong>{selectedMaintenance.length}</strong><span>Maintenance records</span><small>Repairs, vendors and warranties</small></button></div></div>
          </div>
          <div className="quickActions"><div><p className="eyebrow">QUICK ACTIONS</p><h3>Keep this property prepped.</h3></div><div className="quickActionButtons"><button onClick={() => setActiveTab('Documents')}>Upload document</button><button onClick={() => setActiveTab('Photos')}>Add photos</button><button onClick={() => setActiveTab('Financials')}>Add transaction</button></div></div>
        </section>}

        {activeTab === 'Documents' && <section className="workspaceContent">
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">DOCUMENT CENTER</p><h2>Everything important, filed correctly</h2><p>Files are stored in a private Supabase bucket and opened with short-lived signed links.</p></div></div>
          <div className="documentLayout">
            <aside className="categoryPanel"><h3>Categories</h3>{docCategories.map((category) => <button key={category} className={docCategory === category ? 'active' : ''} onClick={() => setDocCategory(category)}><span>{category}</span><small>{category === 'All' ? selectedDocs.length : selectedDocs.filter((d) => d.category === category).length}</small></button>)}</aside>
            <div className="documentMain">
              <div className="uploadControls"><label>File category<select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>{docCategories.filter((c) => c !== 'All').map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className={`dropZone ${isDragging ? 'dragging' : ''}`} onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDragging(false); void addDocumentFiles(e.dataTransfer.files) }}><span className="uploadIcon">↑</span><strong>{busy ? 'Uploading…' : 'Drop documents here or choose files'}</strong><small>PDF, spreadsheets, receipts, contracts and more · up to 50 MB each</small><input type="file" multiple disabled={busy} onChange={(e) => e.target.files && void addDocumentFiles(e.target.files)} /></label>
              </div>
              <div className="documentHeader"><h3>{docCategory === 'All' ? 'All documents' : docCategory}</h3><span>{filteredDocs.length} file{filteredDocs.length === 1 ? '' : 's'}</span></div>
              <div className="documentList">{filteredDocs.length ? filteredDocs.map((doc) => <div className="documentRow" key={doc.id}><div className="fileIcon">{doc.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</div><div className="fileName"><strong>{doc.name}</strong><span>{doc.category} · {formatSize(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</span></div><div className="rowActions"><button onClick={() => void openDocument(doc)}>Open</button><button onClick={() => void removeDocument(doc)}>Remove</button></div></div>) : <div className="emptyState"><strong>No documents here yet</strong><span>Upload a file above and PropPrepped will keep it with this property.</span></div>}</div>
            </div>
          </div>
        </section>}

        {activeTab === 'Photos' && <section className="workspaceContent">
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">PROPERTY PHOTOS</p><h2>Visual record</h2><p>Keep listing photos, renovation progress, inspections and property-condition photos together.</p></div></div>
          <label className="photoUploader"><span>+</span><strong>{busy ? 'Uploading…' : 'Add property photos'}</strong><small>Select multiple images at once. The first photo becomes the cover if there is no cover yet.</small><input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => e.target.files && void addPhotoFiles(e.target.files)} /></label>
          <div className="photoGallery">{selectedPhotos.length ? selectedPhotos.map((photo) => <div className={`galleryItem ${photo.is_cover ? 'coverItem' : ''}`} key={photo.id}>{photo.signedUrl ? <img src={photo.signedUrl} alt={photo.name} /> : <div className="heroPlaceholder">Photo unavailable</div>}<div className="galleryMeta"><span>{photo.name}</span><div className="galleryButtons">{!photo.is_cover && <button onClick={() => void setCover(photo)}>Set cover</button>}<button className="removePhoto" onClick={() => void removePhoto(photo)}>×</button></div></div></div>) : <div className="emptyGallery"><strong>No photos uploaded yet</strong><span>Add photos to build this property's visual history.</span></div>}</div>
        </section>}

        {activeTab === 'Financials' && (() => {
          const income = selectedYearTransactions.filter((t) => t.transaction_type === 'Income').reduce((sum, t) => sum + Number(t.amount), 0)
          const expenses = selectedYearTransactions.filter((t) => t.transaction_type === 'Expense').reduce((sum, t) => sum + Number(t.amount), 0)
          const noiExpenses = selectedYearTransactions.filter((t) => t.transaction_type === 'Expense' && t.category !== 'Mortgage' && t.category !== 'CapEx').reduce((sum, t) => sum + Number(t.amount), 0)
          const noi = income - noiExpenses
          const cashFlow = income - expenses
          const monthKey = new Date().toISOString().slice(0,7)
          const monthRows = selectedTransactions.filter((t) => t.transaction_date.startsWith(monthKey))
          const monthCashFlow = monthRows.reduce((sum, t) => sum + (t.transaction_type === 'Income' ? Number(t.amount) : -Number(t.amount)), 0)
          const years = Array.from(new Set([String(new Date().getFullYear()), ...selectedTransactions.map((t) => t.transaction_date.slice(0,4))])).sort().reverse()
          return <section className="workspaceContent financialWorkspace">
            <div className="sectionHead workspaceHeading financialHeading"><div><p className="eyebrow">FINANCIALS</p><h2>Property ledger</h2><p>Track every dollar with receipts and source documents attached to the transaction.</p></div><div className="financialActions"><select aria-label="Financial year" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{years.map((year) => <option key={year}>{year}</option>)}</select><label className="secondary csvButton">Import CSV<input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importTransactionsCsv(file); e.target.value = '' }} /></label><button className="secondary" onClick={exportTransactionsCsv}>Export CSV</button><button className="primary" onClick={() => setShowTransaction(true)}>+ Add transaction</button></div></div>
            <div className="financialStats"><div className="financialStat"><span>{financialYear} income</span><strong>{money(income)}</strong></div><div className="financialStat"><span>{financialYear} expenses</span><strong>{money(expenses)}</strong></div><div className="financialStat"><span>NOI</span><strong>{money(noi)}</strong><small>Excludes mortgage & CapEx</small></div><div className="financialStat"><span>Net cash flow</span><strong>{money(cashFlow)}</strong><small>{money(monthCashFlow)} this month</small></div></div>
            <div className="ledgerWrap"><table className="ledger"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Vendor</th><th>Description</th><th>Income</th><th>Expense</th><th>Attachment</th><th></th></tr></thead><tbody>{selectedYearTransactions.length ? selectedYearTransactions.map((tx) => { const doc = selectedDocs.find((d) => d.id === tx.document_id); return <tr key={tx.id}><td>{new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString()}</td><td><span className={`transactionType ${tx.transaction_type.toLowerCase()}`}>{tx.transaction_type}</span>{tx.is_recurring && <small className="recurringLabel">Recurring</small>}</td><td>{tx.category}</td><td>{tx.vendor || '—'}</td><td className="descriptionCell">{tx.description}</td><td className="moneyCell incomeCell">{tx.transaction_type === 'Income' ? money(tx.amount) : '—'}</td><td className="moneyCell">{tx.transaction_type === 'Expense' ? money(tx.amount) : '—'}</td><td>{doc ? <button className="attachmentButton" onClick={() => void openDocument(doc)}>{doc.name}</button> : <span className="muted">—</span>}</td><td><button className="deleteTransaction" aria-label={`Delete ${tx.description}`} onClick={() => void removeTransaction(tx.id)}>×</button></td></tr>}) : <tr><td colSpan={9}><div className="emptyLedger"><strong>No {financialYear} transactions yet</strong><span>Add your first rent payment or expense, or import a CSV.</span><button className="primary" onClick={() => setShowTransaction(true)}>+ Add transaction</button></div></td></tr>}</tbody></table></div>
            <p className="ledgerNote">NOI is shown as income less operating expenses and excludes transactions categorized as Mortgage or CapEx. PropPrepped is an organization tool, not tax or accounting advice.</p>
          </section>
        })()}

        {activeTab === 'Lease' && <section className="workspaceContent moduleWorkspace"><div className="sectionHead workspaceHeading"><div><p className="eyebrow">LEASES</p><h2>Tenants & lease terms</h2><p>Keep rent, deposits, renewal dates and the signed lease together.</p></div><button className="primary" onClick={() => setShowModuleForm('Lease')}>+ Add lease</button></div>{selectedLeases.length ? <div className="moduleGrid">{selectedLeases.map((lease) => { const doc=selectedDocs.find(d=>d.id===lease.document_id); return <article className="recordCard" key={lease.id}><div className="recordTop"><div><span className="statusPill">{lease.renewal_status}</span><h3>{lease.tenant_name}</h3><p>{lease.tenant_email || 'No email added'}</p></div><button className="recordDelete" onClick={() => void removeModuleRecord('leases', lease.id)}>×</button></div><div className="recordMetrics"><div><span>Monthly rent</span><strong>{money(lease.monthly_rent)}</strong></div><div><span>Deposit</span><strong>{money(lease.security_deposit)}</strong></div></div><div className="recordRows"><div><span>Lease term</span><strong>{new Date(`${lease.start_date}T12:00:00`).toLocaleDateString()} – {new Date(`${lease.end_date}T12:00:00`).toLocaleDateString()}</strong></div>{doc && <div><span>Signed lease</span><button onClick={() => void openDocument(doc)}>{doc.name}</button></div>}{lease.notes && <div><span>Notes</span><strong>{lease.notes}</strong></div>}</div></article>})}</div> : <EmptyModule title="No lease records yet" text="Add the tenant, rent, deposit, dates and signed lease." action="Add lease" onClick={() => setShowModuleForm('Lease')} />}</section>}

        {activeTab === 'Mortgage' && <section className="workspaceContent moduleWorkspace"><div className="sectionHead workspaceHeading"><div><p className="eyebrow">MORTGAGE</p><h2>Loan details</h2><p>Track your lender, balance, rate, payment and loan documents.</p></div><button className="primary" onClick={() => setShowModuleForm('Mortgage')}>+ Add mortgage</button></div>{selectedMortgages.length ? <div className="moduleGrid">{selectedMortgages.map((loan) => { const doc=selectedDocs.find(d=>d.id===loan.document_id); return <article className="recordCard" key={loan.id}><div className="recordTop"><div><span className="statusPill">Mortgage</span><h3>{loan.lender}</h3><p>{loan.loan_number ? `Loan ••••${loan.loan_number.slice(-4)}` : 'Loan number not added'}</p></div><button className="recordDelete" onClick={() => void removeModuleRecord('mortgages', loan.id)}>×</button></div><div className="recordMetrics"><div><span>Current balance</span><strong>{money(loan.current_balance)}</strong></div><div><span>Monthly payment</span><strong>{money(loan.monthly_payment)}</strong></div><div><span>Rate</span><strong>{Number(loan.interest_rate).toFixed(3)}%</strong></div></div><div className="recordRows"><div><span>Original balance</span><strong>{money(loan.original_balance)}</strong></div><div><span>Escrow / month</span><strong>{money(loan.escrow_amount)}</strong></div>{loan.maturity_date && <div><span>Maturity</span><strong>{new Date(`${loan.maturity_date}T12:00:00`).toLocaleDateString()}</strong></div>}{doc && <div><span>Loan document</span><button onClick={() => void openDocument(doc)}>{doc.name}</button></div>}</div></article>})}</div> : <EmptyModule title="No mortgage details yet" text="Add the lender, balance, rate, monthly payment and loan document." action="Add mortgage" onClick={() => setShowModuleForm('Mortgage')} />}</section>}

        {activeTab === 'Insurance' && <section className="workspaceContent moduleWorkspace"><div className="sectionHead workspaceHeading"><div><p className="eyebrow">INSURANCE</p><h2>Coverage records</h2><p>Keep policy details, premiums, deductibles and expiration dates visible.</p></div><button className="primary" onClick={() => setShowModuleForm('Insurance')}>+ Add policy</button></div>{selectedInsurance.length ? <div className="moduleGrid">{selectedInsurance.map((policy) => { const doc=selectedDocs.find(d=>d.id===policy.document_id); const days=policy.expiration_date ? Math.ceil((new Date(`${policy.expiration_date}T12:00:00`).getTime()-Date.now())/86400000) : null; return <article className="recordCard" key={policy.id}><div className="recordTop"><div><span className={`statusPill ${days !== null && days < 45 ? 'warning' : ''}`}>{days !== null && days < 0 ? 'Expired' : days !== null && days < 45 ? 'Renew soon' : 'Active'}</span><h3>{policy.carrier}</h3><p>{policy.policy_number || 'Policy number not added'}</p></div><button className="recordDelete" onClick={() => void removeModuleRecord('insurance_policies', policy.id)}>×</button></div><div className="recordMetrics"><div><span>Annual premium</span><strong>{money(policy.annual_premium)}</strong></div><div><span>Deductible</span><strong>{money(policy.deductible)}</strong></div></div><div className="recordRows">{policy.effective_date && <div><span>Effective</span><strong>{new Date(`${policy.effective_date}T12:00:00`).toLocaleDateString()}</strong></div>}{policy.expiration_date && <div><span>Expires</span><strong>{new Date(`${policy.expiration_date}T12:00:00`).toLocaleDateString()}</strong></div>}{doc && <div><span>Policy document</span><button onClick={() => void openDocument(doc)}>{doc.name}</button></div>}</div></article>})}</div> : <EmptyModule title="No insurance policies yet" text="Add your carrier, policy, premium, deductible and declaration page." action="Add policy" onClick={() => setShowModuleForm('Insurance')} />}</section>}

        {activeTab === 'Maintenance' && <section className="workspaceContent moduleWorkspace"><div className="sectionHead workspaceHeading"><div><p className="eyebrow">MAINTENANCE</p><h2>Property service history</h2><p>Repairs, preventative work, vendors, costs and receipts in one timeline.</p></div><button className="primary" onClick={() => setShowModuleForm('Maintenance')}>+ Add maintenance</button></div>{selectedMaintenance.length ? <div className="maintenanceList">{selectedMaintenance.map((item) => { const doc=selectedDocs.find(d=>d.id===item.document_id); return <article className="maintenanceRow" key={item.id}><div className="maintenanceDate"><strong>{new Date(`${item.service_date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><span>{new Date(`${item.service_date}T12:00:00`).getFullYear()}</span></div><div className="maintenanceBody"><div className="maintenanceTitle"><div><span className="statusPill">{item.status}</span><h3>{item.description}</h3><p>{item.category}{item.vendor ? ` · ${item.vendor}` : ''}</p></div><strong>{money(item.cost)}</strong></div><div className="maintenanceActions">{doc && <button onClick={() => void openDocument(doc)}>Open {doc.name}</button>}{item.financial_transaction_id && <span>Linked to Financials</span>}<button className="dangerLink" onClick={() => void removeModuleRecord('maintenance_records', item.id, item.financial_transaction_id)}>Remove</button></div></div></article>})}</div> : <EmptyModule title="No maintenance records yet" text="Add repairs, service calls, vendors, costs and receipts as they happen." action="Add maintenance" onClick={() => setShowModuleForm('Maintenance')} />}</section>}

        {showModuleForm && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowModuleForm(null)}><div className="modal moduleModal"><div className="modalTop"><div><p className="eyebrow">{showModuleForm.toUpperCase()}</p><h2>Add {showModuleForm.toLowerCase()}</h2></div><button className="iconButton" onClick={() => setShowModuleForm(null)}>×</button></div>
          {showModuleForm === 'Lease' && <div className="formGrid"><label>Tenant name<input value={leaseDraft.tenantName} onChange={e=>setLeaseDraft({...leaseDraft,tenantName:e.target.value})} /></label><label>Tenant email<input type="email" value={leaseDraft.tenantEmail} onChange={e=>setLeaseDraft({...leaseDraft,tenantEmail:e.target.value})} /></label><label>Monthly rent<input inputMode="decimal" value={leaseDraft.monthlyRent} onChange={e=>setLeaseDraft({...leaseDraft,monthlyRent:e.target.value})} /></label><label>Security deposit<input inputMode="decimal" value={leaseDraft.securityDeposit} onChange={e=>setLeaseDraft({...leaseDraft,securityDeposit:e.target.value})} /></label><label>Start date<input type="date" value={leaseDraft.startDate} onChange={e=>setLeaseDraft({...leaseDraft,startDate:e.target.value})} /></label><label>End date<input type="date" value={leaseDraft.endDate} onChange={e=>setLeaseDraft({...leaseDraft,endDate:e.target.value})} /></label><label>Lease status<select value={leaseDraft.renewalStatus} onChange={e=>setLeaseDraft({...leaseDraft,renewalStatus:e.target.value})}><option>Active</option><option>Renewal pending</option><option>Month-to-month</option><option>Ended</option></select></label><label>Signed lease<select value={leaseDraft.documentId} onChange={e=>setLeaseDraft({...leaseDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Lease'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="fullField">Notes<input value={leaseDraft.notes} onChange={e=>setLeaseDraft({...leaseDraft,notes:e.target.value})} /></label></div>}
          {showModuleForm === 'Mortgage' && <div className="formGrid"><label>Lender<input value={mortgageDraft.lender} onChange={e=>setMortgageDraft({...mortgageDraft,lender:e.target.value})} /></label><label>Loan number<input value={mortgageDraft.loanNumber} onChange={e=>setMortgageDraft({...mortgageDraft,loanNumber:e.target.value})} /></label><label>Original balance<input inputMode="decimal" value={mortgageDraft.originalBalance} onChange={e=>setMortgageDraft({...mortgageDraft,originalBalance:e.target.value})} /></label><label>Current balance<input inputMode="decimal" value={mortgageDraft.currentBalance} onChange={e=>setMortgageDraft({...mortgageDraft,currentBalance:e.target.value})} /></label><label>Interest rate %<input inputMode="decimal" value={mortgageDraft.interestRate} onChange={e=>setMortgageDraft({...mortgageDraft,interestRate:e.target.value})} /></label><label>Monthly payment<input inputMode="decimal" value={mortgageDraft.monthlyPayment} onChange={e=>setMortgageDraft({...mortgageDraft,monthlyPayment:e.target.value})} /></label><label>Escrow / month<input inputMode="decimal" value={mortgageDraft.escrowAmount} onChange={e=>setMortgageDraft({...mortgageDraft,escrowAmount:e.target.value})} /></label><label>Loan term (years)<input inputMode="numeric" value={mortgageDraft.loanTermYears} onChange={e=>setMortgageDraft({...mortgageDraft,loanTermYears:e.target.value})} /></label><label>Maturity date<input type="date" value={mortgageDraft.maturityDate} onChange={e=>setMortgageDraft({...mortgageDraft,maturityDate:e.target.value})} /></label><label>Loan document<select value={mortgageDraft.documentId} onChange={e=>setMortgageDraft({...mortgageDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Mortgage'||d.category==='Closing'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
          {showModuleForm === 'Insurance' && <div className="formGrid"><label>Carrier<input value={insuranceDraft.carrier} onChange={e=>setInsuranceDraft({...insuranceDraft,carrier:e.target.value})} /></label><label>Policy number<input value={insuranceDraft.policyNumber} onChange={e=>setInsuranceDraft({...insuranceDraft,policyNumber:e.target.value})} /></label><label>Annual premium<input inputMode="decimal" value={insuranceDraft.annualPremium} onChange={e=>setInsuranceDraft({...insuranceDraft,annualPremium:e.target.value})} /></label><label>Deductible<input inputMode="decimal" value={insuranceDraft.deductible} onChange={e=>setInsuranceDraft({...insuranceDraft,deductible:e.target.value})} /></label><label>Effective date<input type="date" value={insuranceDraft.effectiveDate} onChange={e=>setInsuranceDraft({...insuranceDraft,effectiveDate:e.target.value})} /></label><label>Expiration date<input type="date" value={insuranceDraft.expirationDate} onChange={e=>setInsuranceDraft({...insuranceDraft,expirationDate:e.target.value})} /></label><label className="fullField">Policy document<select value={insuranceDraft.documentId} onChange={e=>setInsuranceDraft({...insuranceDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Insurance'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
          {showModuleForm === 'Maintenance' && <div className="formGrid"><label>Service date<input type="date" value={maintenanceDraft.serviceDate} onChange={e=>setMaintenanceDraft({...maintenanceDraft,serviceDate:e.target.value})} /></label><label>Status<select value={maintenanceDraft.status} onChange={e=>setMaintenanceDraft({...maintenanceDraft,status:e.target.value})}><option>Completed</option><option>Scheduled</option><option>In progress</option><option>Needs follow-up</option></select></label><label>Category<select value={maintenanceDraft.category} onChange={e=>setMaintenanceDraft({...maintenanceDraft,category:e.target.value})}><option>Repair</option><option>Preventative</option><option>Inspection</option><option>Renovation</option><option>Landscaping</option><option>HVAC</option><option>Plumbing</option><option>Electrical</option><option>Other</option></select></label><label>Vendor<input value={maintenanceDraft.vendor} onChange={e=>setMaintenanceDraft({...maintenanceDraft,vendor:e.target.value})} /></label><label>Cost<input inputMode="decimal" value={maintenanceDraft.cost} onChange={e=>setMaintenanceDraft({...maintenanceDraft,cost:e.target.value})} /></label><label>Receipt / invoice<select value={maintenanceDraft.documentId} onChange={e=>setMaintenanceDraft({...maintenanceDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>['Receipts','Warranties','Other'].includes(d.category)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="fullField">Description<input value={maintenanceDraft.description} onChange={e=>setMaintenanceDraft({...maintenanceDraft,description:e.target.value})} placeholder="HVAC repair, annual service, roof inspection…" /></label><label className="recurringCheck fullField"><input type="checkbox" checked={maintenanceDraft.addToFinancials} onChange={e=>setMaintenanceDraft({...maintenanceDraft,addToFinancials:e.target.checked})} /><span>Add this cost to Financials</span><small>PropPrepped creates a linked Maintenance expense so you only enter the cost once.</small></label></div>}
          <div className="modalActions"><button className="secondary" onClick={() => setShowModuleForm(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void (showModuleForm==='Lease'?saveLease():showModuleForm==='Mortgage'?saveMortgage():showModuleForm==='Insurance'?saveInsurance():saveMaintenance())}>{busy?'Saving…':'Save'}</button></div></div></div>}

        {showTransaction && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowTransaction(false)}><div className="modal transactionModal"><div className="modalTop"><div><p className="eyebrow">FINANCIALS</p><h2>Add transaction</h2></div><button className="iconButton" onClick={() => setShowTransaction(false)}>×</button></div><div className="formGrid transactionGrid"><label>Date<input type="date" value={transactionDraft.date} onChange={(e) => setTransactionDraft({ ...transactionDraft, date: e.target.value })} /></label><label>Type<select value={transactionDraft.type} onChange={(e) => setTransactionDraft({ ...transactionDraft, type: e.target.value as 'Income' | 'Expense', category: e.target.value === 'Income' ? 'Rent' : 'Repairs' })}><option>Income</option><option>Expense</option></select></label><label>Category<select value={transactionDraft.category} onChange={(e) => setTransactionDraft({ ...transactionDraft, category: e.target.value })}>{financialCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Amount<input inputMode="decimal" value={transactionDraft.amount} onChange={(e) => setTransactionDraft({ ...transactionDraft, amount: e.target.value })} placeholder="1250.00" /></label><label>Vendor / payer<input value={transactionDraft.vendor} onChange={(e) => setTransactionDraft({ ...transactionDraft, vendor: e.target.value })} placeholder={transactionDraft.type === 'Income' ? 'Tenant name' : 'Vendor or company'} /></label><label>Attach document<select value={transactionDraft.documentId} onChange={(e) => setTransactionDraft({ ...transactionDraft, documentId: e.target.value })}><option value="">No attachment</option>{selectedDocs.map((doc) => <option value={doc.id} key={doc.id}>{doc.name}</option>)}</select></label><label className="fullField">Description<input value={transactionDraft.description} onChange={(e) => setTransactionDraft({ ...transactionDraft, description: e.target.value })} placeholder="August rent, HVAC repair, property tax…" /></label><label className="recurringCheck fullField"><input type="checkbox" checked={transactionDraft.recurring} onChange={(e) => setTransactionDraft({ ...transactionDraft, recurring: e.target.checked })} /><span>Mark as recurring monthly</span><small>This labels the transaction as recurring; automatic future posting can be enabled in a later milestone.</small></label></div><div className="modalActions"><button className="secondary" onClick={() => setShowTransaction(false)}>Cancel</button><button className="primary" disabled={busy || !transactionDraft.description.trim() || Number(transactionDraft.amount) <= 0} onClick={() => void addTransaction()}>{busy ? 'Saving…' : 'Save transaction'}</button></div></div></div>}
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar"><div><span className="brand">PropPrepped</span><span className="tagline">Your properties. Organized.</span></div><div className="accountActions"><span>{user.email}</span><button className="primary" onClick={() => setShowAdd(true)}>+ Add Property</button><button className="secondary" onClick={() => void signOut()}>Log out</button></div></header>
      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
      <section className="intro"><p className="eyebrow">MY PORTFOLIO</p><h1>Everything about your properties, in one place.</h1><p>Photos, documents, finances and important records organized by property — and now saved securely to your account.</p></section>
      <section className="stats portfolioStats"><div className="stat"><span>Portfolio value</span><strong>{money(totals.value)}</strong></div><div className="stat"><span>Mortgage debt</span><strong>{money(totals.debt)}</strong></div><div className="stat"><span>Estimated equity</span><strong>{money(totals.equity)}</strong></div><div className="stat"><span>Monthly rent</span><strong>{money(totals.rent)}</strong></div><div className="stat financialRollup"><span>YTD income</span><strong>{money(totals.income)}</strong></div><div className="stat financialRollup"><span>YTD expenses</span><strong>{money(totals.expenses)}</strong></div><div className="stat financialRollup"><span>YTD cash flow</span><strong>{money(totals.cashFlow)}</strong></div></section>
      <section><div className="sectionHead"><div><h2>My Properties</h2><p>{busy && !properties.length ? 'Loading your portfolio…' : `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} in your portfolio`}</p></div></div>
        <div className="grid">{properties.map((property) => <article className="propertyCard" key={property.id}><button className="cardOpen" onClick={() => openProperty(property.id)}><div className="photo">{property.coverUrl ? <img src={property.coverUrl} alt={property.address} /> : <div className="photoPlaceholder"><span>⌂</span><small>Add property photos</small></div>}<span className="badge">{property.property_type}</span></div></button><div className="cardBody"><button className="titleButton" onClick={() => openProperty(property.id)}><h3>{property.address}</h3><p className="muted">{property.city}</p></button><div className="miniStats"><div><span>Value</span><strong>{money(property.estimated_value)}</strong></div><div><span>Equity</span><strong>{money(Number(property.estimated_value) - Number(property.mortgage_balance))}</strong></div><div><span>Rent</span><strong>{money(property.monthly_rent)}</strong></div></div><div className="cardActions"><button onClick={() => openProperty(property.id, 'Documents')}>Documents</button><button onClick={() => openProperty(property.id, 'Photos')}>Photos</button><button onClick={() => openProperty(property.id, 'Financials')}>Financials</button></div></div></article>)}
          {!busy && properties.length === 0 && <button className="emptyPropertyCard" onClick={() => setShowAdd(true)}><strong>+ Add your first property</strong><span>Start building your organized property file.</span></button>}
        </div>
      </section>

      {showAdd && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowAdd(false)}><div className="modal"><div className="modalTop"><h2>Add a property</h2><button className="iconButton" onClick={() => setShowAdd(false)}>×</button></div><label className="uploadBox">{imagePreview ? <img src={imagePreview} alt="Property preview" /> : <div><strong>Add a cover photo</strong><span>Choose a photo now or add one later</span></div>}<input type="file" accept="image/*" onChange={handleImage} /></label><div className="formGrid"><label>Street address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="12109 Rustic River Way" /></label><label>City, state & ZIP<input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Tampa, FL 33635" /></label><label>Property type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option>Rental Property</option><option>Primary Residence</option><option>Vacation Home</option><option>Commercial</option><option>Land</option><option>Other</option></select></label><label>Purchase price<input inputMode="decimal" value={draft.purchasePrice} onChange={(e) => setDraft({ ...draft, purchasePrice: e.target.value })} placeholder="390000" /></label><label>Estimated value<input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="520000" /></label><label>Mortgage balance<input inputMode="decimal" value={draft.mortgage} onChange={(e) => setDraft({ ...draft, mortgage: e.target.value })} placeholder="310000" /></label><label>Monthly rent<input inputMode="decimal" value={draft.rent} onChange={(e) => setDraft({ ...draft, rent: e.target.value })} placeholder="2950" /></label><label>Monthly property expenses<input inputMode="decimal" value={draft.monthlyExpenses} onChange={(e) => setDraft({ ...draft, monthlyExpenses: e.target.value })} placeholder="1925" /></label></div><div className="modalActions"><button className="secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void addProperty()}>{busy ? 'Saving…' : 'Save Property'}</button></div></div></div>}
    </main>
  )
}
