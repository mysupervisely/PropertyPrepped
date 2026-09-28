import { describe, expect, it } from 'vitest'
import { decideBackButtonAction } from './backButton'

describe('decideBackButtonAction', () => {
  it('navigates history backward when the WebView can go back', () => {
    expect(decideBackButtonAction(true)).toBe('history-back')
  })

  it('exits the app only when there is nowhere left to go back to', () => {
    expect(decideBackButtonAction(false)).toBe('exit-app')
  })
})
