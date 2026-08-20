import { describe, expect, it } from 'vitest'
import { buildAnalysis, type AnalysisInput } from '../investment-calculations'
import { buildHomePurchaseAnalysis, type HomePurchaseInput } from '../investment-tools/home-purchase-calculations'
import { buildRentalAnalyzerLeadSnapshot, buildHomePurchaseLeadSnapshot } from './snapshot'

const rentalInput: AnalysisInput = {
  purchasePrice: 350000,
  marketValue: 350000,
  units: 1,
  downPaymentMode: 'percent',
  downPaymentPercent: 20,
  interestRatePercent: 6.5,
  loanTermYears: 30,
  closingCosts: 6000,
  loanPointsPercent: 0,
  monthlyRent: 2800,
  otherMonthlyIncome: 0,
  propertyTaxesAnnual: 3600,
  insuranceAnnual: 1400,
  hoaMonthly: 0,
  managementMode: 'percent',
  managementPercent: 8,
  maintenanceMode: 'percent',
  maintenancePercent: 5,
  vacancyPercent: 5,
  utilitiesMonthly: 0,
  otherExpensesMonthly: 0,
  appreciationRatePercent: 3,
  rentGrowthRatePercent: 2,
  expenseGrowthRatePercent: 2,
}

describe('buildRentalAnalyzerLeadSnapshot', () => {
  it('captures the requested Rental Analyzer fields from a normal financed analysis', () => {
    const result = buildAnalysis(rentalInput)
    const snapshot = buildRentalAnalyzerLeadSnapshot('17 Amaryllis Ln, Tampa, FL 33602', rentalInput, result)

    expect(snapshot.source).toBe('rental_analyzer')
    expect(snapshot.propertyAddress).toBe('17 Amaryllis Ln, Tampa, FL 33602')
    expect(snapshot.purchasePrice).toBe(350000)
    expect(snapshot.downPaymentAmount).toBe(70000)
    expect(snapshot.downPaymentPercent).toBe(20)
    expect(snapshot.loanAmount).toBe(280000)
    expect(snapshot.interestRatePercent).toBe(6.5)
    expect(snapshot.estimatedRentMonthly).toBe(2800)
    expect(snapshot.operatingExpensesMonthly).toBeGreaterThan(0)
    expect(snapshot.noiAnnual).toBeGreaterThan(0)
    expect(typeof snapshot.monthlyCashFlow).toBe('number')
    expect(snapshot.capRatePercent).not.toBeUndefined()
    expect(snapshot.cashOnCashReturnPercent).not.toBeUndefined()
    expect(snapshot.dscr).not.toBeUndefined()
  })

  it('omits DSCR/cap rate/cash-on-cash rather than fabricating them for an all-cash purchase (they are null in the result)', () => {
    const allCashInput: AnalysisInput = { ...rentalInput, downPaymentMode: 'percent', downPaymentPercent: 100 }
    const result = buildAnalysis(allCashInput)
    expect(result.dscr).toBeNull() // sanity: confirms the source data really is null here
    const snapshot = buildRentalAnalyzerLeadSnapshot('', allCashInput, result)
    expect(snapshot.dscr).toBeUndefined()
  })

  it('omits the address when none was entered, never sending an empty string', () => {
    const result = buildAnalysis(rentalInput)
    const snapshot = buildRentalAnalyzerLeadSnapshot('   ', rentalInput, result)
    expect(snapshot.propertyAddress).toBeUndefined()
  })

  it('omits purchasePrice/interestRatePercent when genuinely zero/not entered, rather than sending 0', () => {
    const emptyInput: AnalysisInput = { ...rentalInput, purchasePrice: 0, interestRatePercent: 0, downPaymentPercent: 0 }
    const result = buildAnalysis(emptyInput)
    const snapshot = buildRentalAnalyzerLeadSnapshot('', emptyInput, result)
    expect(snapshot.purchasePrice).toBeUndefined()
    expect(snapshot.interestRatePercent).toBeUndefined()
  })
})

const homePurchaseInput: HomePurchaseInput = {
  purchasePrice: 450000,
  downPaymentMode: 'percent',
  downPaymentPercent: 20,
  interestRatePercent: 6.5,
  loanTermYears: 30,
  propertyTaxesAnnual: 5400,
  homeInsuranceAnnual: 1800,
  hoaMonthly: 0,
  pmiMonthly: 0,
  closingCostsMode: 'percent',
  closingCostsPercent: 3,
}

describe('buildHomePurchaseLeadSnapshot', () => {
  it('captures the requested Home Purchase Calculator fields', () => {
    const result = buildHomePurchaseAnalysis(homePurchaseInput)
    const snapshot = buildHomePurchaseLeadSnapshot('123 Example St, Tampa, FL 33602', homePurchaseInput, result)

    expect(snapshot.source).toBe('home_purchase')
    expect(snapshot.propertyAddress).toBe('123 Example St, Tampa, FL 33602')
    expect(snapshot.purchasePrice).toBe(450000)
    expect(snapshot.downPaymentAmount).toBe(90000)
    expect(snapshot.downPaymentPercent).toBe(20)
    expect(snapshot.loanAmount).toBe(360000)
    expect(snapshot.interestRatePercent).toBe(6.5)
    expect(snapshot.estimatedMonthlyPayment).toBeGreaterThan(0)
    expect(snapshot.propertyTaxMonthly).toBeCloseTo(450, 0)
    expect(snapshot.insuranceMonthly).toBeCloseTo(150, 0)
    expect(snapshot.closingCostsAmount).toBe(13500)
    expect(snapshot.cashNeededToClose).toBe(90000 + 13500)
  })

  it('omits HOA/PMI when they are genuinely zero (never entered)', () => {
    const result = buildHomePurchaseAnalysis(homePurchaseInput)
    const snapshot = buildHomePurchaseLeadSnapshot('', homePurchaseInput, result)
    expect(snapshot.hoaMonthly).toBeUndefined()
  })

  it('includes HOA when a real value is present', () => {
    const withHoa: HomePurchaseInput = { ...homePurchaseInput, hoaMonthly: 250 }
    const result = buildHomePurchaseAnalysis(withHoa)
    const snapshot = buildHomePurchaseLeadSnapshot('', withHoa, result)
    expect(snapshot.hoaMonthly).toBe(250)
  })
})
