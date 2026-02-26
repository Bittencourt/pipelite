import { describe, it, expect } from 'vitest'
import { evaluateFormula, extractDependencies, detectCircularDependency } from './formula-engine'

describe('formula-engine', () => {
  describe('evaluateFormula', () => {
    it('evaluates basic arithmetic', async () => {
      const result = await evaluateFormula('{{Value}} * 2', { Value: 50 })
      expect(result.value).toBe(100)
      expect(result.error).toBeNull()
    })

    it('evaluates string concatenation', async () => {
      const result = await evaluateFormula('{{First}} + " " + {{Last}}', { First: 'John', Last: 'Doe' })
      expect(result.value).toBe('John Doe')
    })

    it('handles TEXT.upper function', async () => {
      const result = await evaluateFormula('TEXT.upper({{Name}})', { Name: 'test' })
      expect(result.value).toBe('TEST')
    })

    it('handles TEXT.lower function', async () => {
      const result = await evaluateFormula('TEXT.lower({{Name}})', { Name: 'TEST' })
      expect(result.value).toBe('test')
    })

    it('handles DATE.today function', async () => {
      const result = await evaluateFormula('DATE.today()')
      expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('handles LOGIC.if function', async () => {
      const result = await evaluateFormula('LOGIC.if({{Score}} > 100, "High", "Low")', { Score: 150 })
      expect(result.value).toBe('High')
    })

    it('handles MATH functions', async () => {
      const result = await evaluateFormula('MATH.round({{Value}} / 3)', { Value: 10 })
      expect(result.value).toBe(3)
    })

    it('propagates null values', async () => {
      const result = await evaluateFormula('{{Missing}} + 1', { Missing: null })
      expect(result.value).toBeNull()
    })

    it('handles missing field as null', async () => {
      const result = await evaluateFormula('{{NonExistent}}', {})
      expect(result.value).toBeNull()
    })

    it('returns error for invalid syntax', async () => {
      const result = await evaluateFormula('invalid syntax (((', {})
      expect(result.error).toBeTruthy()
    })

    it('handles related entity references', async () => {
      const result = await evaluateFormula('{{Revenue}}', {}, { Organization: { Revenue: 1000 } })
      expect(result.value).toBe(1000)
    })

    it('handles MATH.abs', async () => {
      const result = await evaluateFormula('MATH.abs({{Value}})', { Value: -5 })
      expect(result.value).toBe(5)
    })

    it('handles DATE.diffDays', async () => {
      const result = await evaluateFormula('DATE.diffDays("2024-01-10", "2024-01-01")')
      expect(result.value).toBe(9)
    })

    it('handles TEXT.trim function', async () => {
      const result = await evaluateFormula('TEXT.trim({{Name}})', { Name: '  test  ' })
      expect(result.value).toBe('test')
    })

    it('handles TEXT.len function', async () => {
      const result = await evaluateFormula('TEXT.len({{Name}})', { Name: 'hello' })
      expect(result.value).toBe(5)
    })

    it('handles TEXT.concat function', async () => {
      const result = await evaluateFormula('TEXT.concat({{A}}, {{B}})', { A: 'Hello', B: 'World' })
      expect(result.value).toBe('HelloWorld')
    })

    it('handles TEXT.contains function', async () => {
      const result = await evaluateFormula('TEXT.contains({{Text}}, "test")', { Text: 'this is a test' })
      expect(result.value).toBe(true)
    })

    it('handles LOGIC.and function', async () => {
      const result = await evaluateFormula('LOGIC.and({{A}}, {{B}})', { A: true, B: true })
      expect(result.value).toBe(true)
    })

    it('handles LOGIC.or function', async () => {
      const result = await evaluateFormula('LOGIC.or({{A}}, {{B}})', { A: false, B: true })
      expect(result.value).toBe(true)
    })

    it('handles LOGIC.not function', async () => {
      const result = await evaluateFormula('LOGIC.not({{Value}})', { Value: true })
      expect(result.value).toBe(false)
    })

    it('handles LOGIC.isBlank function', async () => {
      const result = await evaluateFormula('LOGIC.isBlank({{Value}})', { Value: null })
      expect(result.value).toBe(true)
    })

    it('handles LOGIC.isNumber function', async () => {
      const result = await evaluateFormula('LOGIC.isNumber({{Value}})', { Value: 42 })
      expect(result.value).toBe(true)
    })

    it('handles MATH.ceil function', async () => {
      const result = await evaluateFormula('MATH.ceil({{Value}})', { Value: 3.2 })
      expect(result.value).toBe(4)
    })

    it('handles MATH.floor function', async () => {
      const result = await evaluateFormula('MATH.floor({{Value}})', { Value: 3.8 })
      expect(result.value).toBe(3)
    })

    it('handles MATH.max function', async () => {
      const result = await evaluateFormula('MATH.max({{A}}, {{B}})', { A: 5, B: 10 })
      expect(result.value).toBe(10)
    })

    it('handles MATH.min function', async () => {
      const result = await evaluateFormula('MATH.min({{A}}, {{B}})', { A: 5, B: 10 })
      expect(result.value).toBe(5)
    })

    it('handles MATH.sqrt function', async () => {
      const result = await evaluateFormula('MATH.sqrt({{Value}})', { Value: 16 })
      expect(result.value).toBe(4)
    })

    it('handles MATH.pow function', async () => {
      const result = await evaluateFormula('MATH.pow({{Base}}, {{Exp}})', { Base: 2, Exp: 3 })
      expect(result.value).toBe(8)
    })

    it('handles DATE.now function', async () => {
      const result = await evaluateFormula('DATE.now()')
      expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('handles DATE.year function', async () => {
      const result = await evaluateFormula('DATE.year("2024-06-15")')
      expect(result.value).toBe(2024)
    })

    it('handles DATE.month function', async () => {
      const result = await evaluateFormula('DATE.month("2024-06-15")')
      expect(result.value).toBe(6)
    })

    it('handles DATE.day function', async () => {
      const result = await evaluateFormula('DATE.day("2024-06-15")')
      expect(result.value).toBe(15)
    })

    it('handles DATE.addDays function', async () => {
      const result = await evaluateFormula('DATE.addDays("2024-01-01", 5)')
      expect(result.value).toBe('2024-01-06')
    })
  })

  describe('extractDependencies', () => {
    it('extracts single field reference', () => {
      const deps = extractDependencies('{{Value}} * 2')
      expect(deps).toEqual(['Value'])
    })

    it('extracts multiple field references', () => {
      const deps = extractDependencies('{{A}} + {{B}}')
      expect(deps).toEqual(['A', 'B'])
    })

    it('extracts related entity references', () => {
      const deps = extractDependencies('{{Organization.Revenue}}')
      expect(deps).toEqual(['Organization.Revenue'])
    })

    it('returns empty array for no references', () => {
      const deps = extractDependencies('100 + 200')
      expect(deps).toEqual([])
    })

    it('handles duplicate references', () => {
      const deps = extractDependencies('{{Value}} + {{Value}}')
      expect(deps).toEqual(['Value', 'Value'])
    })

    it('handles field names with spaces', () => {
      const deps = extractDependencies('{{Field Name}} + {{Another Field}}')
      expect(deps).toEqual(['Field Name', 'Another Field'])
    })
  })

  describe('detectCircularDependency', () => {
    it('detects direct circular dependency', () => {
      const deps = new Map([
        ['A', ['B']],
        ['B', ['A']],
      ])
      expect(detectCircularDependency('A', deps)).toBe(true)
    })

    it('detects indirect circular dependency', () => {
      const deps = new Map([
        ['A', ['B']],
        ['B', ['C']],
        ['C', ['A']],
      ])
      expect(detectCircularDependency('A', deps)).toBe(true)
    })

    it('returns false for no circular dependency', () => {
      const deps = new Map([
        ['A', ['B']],
        ['B', ['C']],
        ['C', []],
      ])
      expect(detectCircularDependency('A', deps)).toBe(false)
    })

    it('handles empty dependencies', () => {
      const deps = new Map([['A', []]])
      expect(detectCircularDependency('A', deps)).toBe(false)
    })

    it('handles self-referencing field', () => {
      const deps = new Map([
        ['A', ['A']],
      ])
      expect(detectCircularDependency('A', deps)).toBe(true)
    })

    it('handles complex dependency chain without cycle', () => {
      const deps = new Map([
        ['A', ['B', 'C']],
        ['B', ['D']],
        ['C', ['D']],
        ['D', ['E']],
        ['E', []],
      ])
      expect(detectCircularDependency('A', deps)).toBe(false)
    })
  })
})
