'use client'

// PropRoster — Guided Maintenance Intake M2 V1 (Milestone 27).
//
// Mobile-first, one-question-at-a-time wizard (Section 9 of the M2
// brief). Replaces the old plain category/title/description form at
// this call site — the "Other" tree's own free-text description step
// already covers what that plain form did, so keeping both would be
// exactly the "giant form" duplication Section 9 warns against.
//
// TENANT REPORTS SYMPTOMS. PROFESSIONAL DIAGNOSES THE PROBLEM. This
// component only ever walks the deterministic trees in
// lib/maintenance/intake/definitions/*.ts (engine.ts) and calls
// submitGuidedIntake() (submit.ts) once, at the very end. No AI call
// anywhere in this file.

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MAINTENANCE_CATEGORIES, maintenanceCategoryLabel, type MaintenanceCategoryId } from '../../lib/maintenance/categories'
import { intakeTreeFor } from '../../lib/maintenance/intake/definitions'
import { getNextStepId, answeredStepsInOrder, buildSummary, deriveTitle } from '../../lib/maintenance/intake/engine'
import { URGENT_STEP_ID, type IntakeStep } from '../../lib/maintenance/intake/types'
import { URGENT_GUIDANCE } from '../../lib/maintenance/intake/urgent'
import { submitGuidedIntake } from '../../lib/maintenance/intake/submit'
import { draftStorageKey, serializeDraft, parseDraft, type IntakeDraft } from '../../lib/maintenance/intake/draft'

type Phase = 'category' | 'question' | 'urgent' | 'review' | 'submitting' | 'error' | 'done'

function loadDraft(tenantAccessId: string): IntakeDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftStorageKey(tenantAccessId)))
  } catch {
    return null
  }
}

function saveDraft(tenantAccessId: string, draft: IntakeDraft) {
  try { window.localStorage.setItem(draftStorageKey(tenantAccessId), serializeDraft(draft)) } catch { /* best-effort only */ }
}

function clearDraft(tenantAccessId: string) {
  try { window.localStorage.removeItem(draftStorageKey(tenantAccessId)) } catch { /* best-effort only */ }
}

export function GuidedIntake({ supabase, propertyId, ownerId, tenantAccessId, onClose, onSubmitted }: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  tenantAccessId: string
  onClose: () => void
  onSubmitted: (tenantRequestId: string) => void
}) {
  const [phase, setPhase] = useState<Phase>('category')
  const [category, setCategory] = useState<MaintenanceCategoryId | null>(null)
  const [stepHistory, setStepHistory] = useState<string[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [extraNote, setExtraNote] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [resumeOffer, setResumeOffer] = useState<IntakeDraft | null>(null)

  useEffect(() => {
    const draft = loadDraft(tenantAccessId)
    if (draft && draft.stepHistory.length) setResumeOffer(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantAccessId])

  useEffect(() => {
    if (phase === 'category' || phase === 'done') return
    if (!category) return
    saveDraft(tenantAccessId, { category, stepHistory, answers })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, stepHistory, answers, phase])

  const tree = category ? intakeTreeFor(category) : null
  const currentStepId = stepHistory[stepHistory.length - 1] ?? null
  const currentStep: IntakeStep | null = tree && currentStepId ? tree.steps[currentStepId] : null

  function startCategory(id: MaintenanceCategoryId) {
    const t = intakeTreeFor(id)
    setCategory(id)
    setStepHistory([t.entryStepId])
    setAnswers({})
    setPhase('question')
  }

  function resume(draft: IntakeDraft) {
    setCategory(draft.category)
    setStepHistory(draft.stepHistory)
    setAnswers(draft.answers)
    setResumeOffer(null)
    setPhase('question')
  }

  function dismissResume() {
    clearDraft(tenantAccessId)
    setResumeOffer(null)
  }

  function answer(value: string) {
    if (!tree || !currentStep) return
    const nextAnswers = { ...answers, [currentStep.question.key]: value }
    setAnswers(nextAnswers)
    const nextId = getNextStepId(tree, currentStep.id, nextAnswers)
    if (nextId === URGENT_STEP_ID) {
      setPhase('urgent')
      return
    }
    if (nextId === null) {
      setPhase('review')
      return
    }
    setStepHistory((h) => [...h, nextId])
  }

  function goBack() {
    if (stepHistory.length <= 1) { setCategory(null); setPhase('category'); return }
    setStepHistory((h) => h.slice(0, -1))
  }

  function continueFromUrgentToReview() {
    setPhase('review')
  }

  async function submit() {
    if (!tree || !category) return
    setPhase('submitting')
    setErrorMessage('')
    const isUrgentSubmission = getUrgentReason() !== null
    const walked = answeredStepsInOrder(tree, answers)
    const { title, description } = buildSummary(tree, answers, deriveTitle(tree, answers, maintenanceCategoryLabel(category)))
    const fullDescription = extraNote.trim() ? `${description}\n\nAdditional note from tenant:\n${extraNote.trim()}` : description

    const result = await submitGuidedIntake({
      supabase, propertyId, ownerId, tenantAccessId,
      category, treeVersion: tree.version,
      title, description: fullDescription,
      answeredSteps: walked,
      outcome: isUrgentSubmission ? 'escalated_urgent' : 'escalated_to_dispatch',
      photos: photos.map((file) => ({ file })),
    })

    if (!result.ok) {
      setErrorMessage(result.error)
      setPhase('error')
      return
    }
    clearDraft(tenantAccessId)
    setPhase('done')
    onSubmitted(result.tenantRequestId)
  }

  function getUrgentReason() {
    if (!tree || !currentStep) return null
    // Re-derive from the answer that actually triggered urgent (the
    // last-answered step), never trusted from separate state — same
    // "server/engine is the source of truth" principle as the rest of
    // this feature.
    const value = answers[currentStep.question.key]
    return currentStep.question.options?.find((o) => o.value === value)?.urgentReason ?? null
  }

  const totalAnswered = stepHistory.length

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal guidedIntakeModal">
        <div className="modalTop">
          <h2>Report an issue</h2>
          <button className="iconButton" onClick={onClose} aria-label="Close">×</button>
        </div>

        {resumeOffer && phase === 'category' && (
          <div className="guidedIntakeResume">
            <p>You have an unfinished report. Would you like to continue where you left off?</p>
            <div className="guidedIntakeResumeActions">
              <button className="secondary" onClick={dismissResume}>Start over</button>
              <button className="primary" onClick={() => resume(resumeOffer)}>Continue</button>
            </div>
          </div>
        )}

        {phase === 'category' && !resumeOffer && (
          <div className="guidedIntakeCategoryGrid">
            {MAINTENANCE_CATEGORIES.map((c) => (
              <button key={c.id} className="guidedIntakeCategoryTile" onClick={() => startCategory(c.id)}>{c.label}</button>
            ))}
          </div>
        )}

        {phase === 'question' && currentStep && (
          <div className="guidedIntakeQuestion">
            <div className="guidedIntakeProgress" aria-hidden="true">Step {totalAnswered}</div>
            <p className="guidedIntakeQuestionPrompt">{currentStep.question.prompt}</p>
            {currentStep.question.helpText && <p className="guidedIntakeHelpText muted">{currentStep.question.helpText}</p>}

            {currentStep.question.type === 'select' && (
              <div className="guidedIntakeOptions">
                {currentStep.question.options?.map((opt) => (
                  <button key={opt.value} className="guidedIntakeOptionTile" onClick={() => answer(opt.value)}>{opt.label}</button>
                ))}
              </div>
            )}

            {currentStep.question.type === 'text' && (
              <GuidedIntakeTextInput unitSuffix={currentStep.question.unitSuffix} onSubmit={answer} />
            )}

            {currentStep.question.type === 'photo' && (
              <div className="guidedIntakePhotoStep">
                <label className="secondary guidedIntakePhotoLabel">
                  {photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : 'Add a photo'}
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => setPhotos((prev) => [...prev, ...Array.from(e.target.files || [])].slice(0, 5))} />
                </label>
                <button className="primary" onClick={() => answer(photos.length ? 'attached' : 'skipped')}>{photos.length ? 'Continue' : 'Skip'}</button>
              </div>
            )}

            <div className="guidedIntakeNav">
              <button className="secondary" onClick={goBack}>Back</button>
              {currentStep.question.optional && currentStep.question.type !== 'photo' && (
                <button className="secondary" onClick={() => answer('')}>Skip</button>
              )}
            </div>
          </div>
        )}

        {phase === 'urgent' && (() => {
          const reason = getUrgentReason()
          const guidance = reason ? URGENT_GUIDANCE[reason] : null
          return (
            <div className="guidedIntakeUrgent">
              {guidance && (
                <>
                  <h3>{guidance.heading}</h3>
                  <ul>{guidance.body.map((line, i) => <li key={i}>{line}</li>)}</ul>
                </>
              )}
              <p className="muted">PropRoster is not an emergency service. If anyone is in danger, call 911 first.</p>
              <div className="guidedIntakeNav">
                <button className="secondary" onClick={onClose}>Close</button>
                <button className="primary" onClick={continueFromUrgentToReview}>I'm safe — submit this report to my landlord</button>
              </div>
            </div>
          )
        })()}

        {phase === 'review' && tree && category && (() => {
          const { description } = buildSummary(tree, answers, deriveTitle(tree, answers, maintenanceCategoryLabel(category)))
          return (
            <div className="guidedIntakeReview">
              <h3>Review before you submit</h3>
              <pre className="guidedIntakeSummary">{description}</pre>
              {photos.length > 0 && <p className="muted">{photos.length} photo{photos.length > 1 ? 's' : ''} attached</p>}
              <label>Anything else to add? (optional)<textarea rows={3} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} /></label>
              <div className="guidedIntakeNav">
                <button className="secondary" onClick={goBack}>Back</button>
                <button className="primary" onClick={() => void submit()}>Submit to my landlord</button>
              </div>
            </div>
          )
        })()}

        {phase === 'submitting' && <p className="muted">Submitting…</p>}

        {phase === 'error' && (
          <div className="guidedIntakeError">
            <p className="statusMessage errorMessage">{errorMessage}</p>
            <div className="guidedIntakeNav">
              <button className="secondary" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => void submit()}>Try again</button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="guidedIntakeDone">
            <p>Your report was submitted. Your landlord has been notified.</p>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

function GuidedIntakeTextInput({ unitSuffix, onSubmit }: { unitSuffix?: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <div className="guidedIntakeTextInput">
      <div className="guidedIntakeTextInputRow">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={unitSuffix ? `e.g. 72` : undefined} autoFocus />
        {unitSuffix && <span className="muted">{unitSuffix}</span>}
      </div>
      <button className="primary" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>Continue</button>
    </div>
  )
}
