# Testing Guide
  2
  3 This document covers testing practices and patterns in the Pipelite codebase.
  4
  5
  6
  7 ## Overview
  8
  9 Pipelite uses **Vitest** as the test framework. Tests are co-located with source files and follow the pattern: `*.test.ts` or `*.spec.ts` files placed next to the modules they test.
  9
   10
   11
   12
   13 ## Test Structure
   14
   15
   16
   17 - **Test files**: Named `*.test.ts` or `*.spec.ts` (e.g., `formula-engine.test.ts`)
   18    - **Co-location**: Place test files next to source files
   19    - **Example**: `src/lib/formula-engine.ts` and `src/lib/formula-engine.test.ts`
   20
   21
   22
   23
   24
   25
   26
   27 ## Running Tests
   28
   29
   30
   31
   32
   33
   34    ```bash
   35    # Run all tests
   36    npm test
   37
   38    # Run in watch mode (re-runs on file changes)
   39    npm test -- --watch
   40
   41    # Run specific test file
   42    npm test src/lib/formula-engine.test.ts
   43
   44    # Run with coverage report
   45    npm test -- --coverage
   46    ```
   47
   48
   49
   50
   51
   52
   53 ## Writing Unit Tests
   54
   55
   56
   57
   58
   59
   60
   61    ```typescript
   62    import { describe, it, expect } from 'vitest'
   63    import { functionToTest } from './module'
   64    
   65    describe('functionToTest', () => {
   66      it('should handle normal case', () => {
   67        const result = functionToTest('input')
   68        expect(result).toBe('expected')
   69      })
   70        
   71      it('should handle edge case', () => {
   72        const result = functionToTest(null)
   73        expect(result).toBe('expected for null')
   74      })
   75        
   76      it('should throw on invalid input', () => {
   77        expect(() => functionToTest(undefined)).toThrow()
   78      })
   79    })
   80    ```
   81
   82
   83
   84 ### Test Organization
   85
   86
   87
   88
   89 - **describe block**: Group related tests
   90    - **it blocks**: Individual test cases
   91    - **Descriptive names**: Test names should describe behavior
   92    - **One concept per test**: Each test should verify one specific behavior
   93
   94
   95
   96
   97
   98
   99 ## Testing Server Actions
   100
   101
  102
   103 Server actions require mocking database calls and testing both success and error paths:
   104
   105
  106
  107
  108
   109
   110
   111    ```typescript
   112    import { describe, it, expect, vi } from 'vitest'
   113    import { createOrganization } from './actions/organization'
   114    
   115    // Mock database
   116    vi.mock('./lib/db', () => ({
   117      db: {
   118        insert: vi.fn(),
   119      query: vi.fn(),
   120      }
   121    }))
   122
   123    describe('createOrganization', () => {
   124      it('should create organization successfully', async () => {
   125        const mockDb = vi.mocked('./lib/db')
   126        mockDb.insert.mockResolvedValue([{ id: 'org-123' }])
   127
   128        const formData = new FormData()
   129        formData.append('name', 'Test Org')
   130
   131        const result = await createOrganization(formData)
   132
   133        expect(result).toEqual({ success: true, id: 'org-123' })
   134        expect(mockDb.insert).toHaveBeenCalledWith(
   135          expect.anything(),
   136          expect.objectContaining({ name: 'Test Org' })
   137        )
   138      })
   139
   140      it('should return error for missing name', async () => {
   141        const formData = new FormData()
   142        // name is missing
   143
   144        const result = await createOrganization(formData)
   145
   146        expect(result).toEqual({
   147          success: false,
   148          error: 'Name is required'
   149        })
   150      })
   151    })
   152    ```
   153
   154
   155
   156
   157 ### Key Points
   158
   159
   160
   161 - **Mock database calls**: Use `vi.mock()` for database operations
   162    - **Test both paths**: Verify success and error scenarios
   163    - **Validate return format**: Check that return value matches expected pattern
   164    - **Test validation**: Ensure input validation works correctly
   165
   166
   167
   168
   169
   170
   171
   172
   173
   174 ## Testing Components
   175
   176
   177
   178 Use `@testing-library/react` for testing React components:
   179
   180
   181
   182
   183
   184
   185
   186    ```typescript
   187    import { render, screen, fireEvent } from '@testing-library/react'
   188    import { describe, it, expect, vi } from 'vitest'
   189    import { Button } from './button'
   190    
   191    describe('Button', () => {
   192      it('renders with text', () => {
   193        render(<Button>Click me</Button>)
   194        expect(screen.getByText('Click me')).toBeInTheDocument()
   195      })
   196
   197
   198      it('calls onClick when clicked', () => {
   199        const onClick = vi.fn()
   200        render(<Button onClick={onClick}>Click me</Button>)
   201
   202        fireEvent.click(screen.getByText('Click me'))
   203
   204        expect(onClick).toHaveBeenCalled()
   205      })
   206
   207
   208      it('is disabled when disabled prop is true', () => {
   209        render(<Button disabled>Click me</Button>)
   210
   211        expect(screen.getByText('Click me')).toBeDisabled()
   212      })
   213    })
   214    ```
   215
   216
   217
   218
   219 ### Key Points
   220
   221
   222 - **Test user interactions**: Focus on what users do, not implementation details
   223    - **Use accessible queries**: Prefer `getByRole`, `getByText` over test IDs
   224    - **Mock external dependencies**: Mock imports for server components or hooks
   225    - **Test accessibility**: Verify keyboard navigation and screen readers
   226
   227
   228
   229
   230
   231
   232
   233
   234 ## Testing Utilities
   235
   236
   237
   238 Pure utility functions are straightforward to test. Focus on edge cases:
   239
   240
   241
   242
   243
   244
   245    ```typescript
   246    import { describe, it, expect } from 'vitest'
   247    import { formatDate, formatCurrency } from './utils/format'
   248
   249    describe('formatDate', () => {
   250      it('formats date correctly', () => {
   251        const date = new Date('2024-01-15')
   252        const result = formatDate(date, 'en-US')
   253        expect(result).toBe('January 15, 2024')
   254      })
   255
   256      it('handles null dates', () => {
   257        expect(formatDate(null)).toBe('')
   258        expect(formatDate(undefined)).toBe('')
   259      })
   260    })
   261
   262    describe('formatCurrency', () => {
   263      it('formats USD correctly', () => {
   264        const result = formatCurrency(1234.56, 'USD', 'en-US')
   265        expect(result).toBe('$1,234.56')
   266      })
   267
   268
   269      it('formats EUR correctly', () => {
   270        const result = formatCurrency(1234.56, 'EUR', 'de-DE')
   271        expect(result).toBe('1.234,56 €')
   272      })
   273
   274
   275      it('handles null values', () => {
   276        expect(formatCurrency(null, 'USD', 'en-US')).toBe('')
   277      })
   278    })
   279    ```
   280
   281
   282
   283
   284 ### Key Points
   285
   286
   287 - **Test pure functions**: No mocking needed for most utilities
   288    - **Test edge cases**: Include null, undefined, empty string, invalid formats
   289    - **Test multiple locales**: Verify internationalization support
   290    - **Use descriptive names**: Test names should describe expected behavior
   291
   292
   293
   294
   295
   296
   297
   298 ## Test Coverage
   299
   300
   301
   302
   303 | Area | Target | Coverage Tool |
   304|------|--------|---------------|
   305| **Business logic** | High (80%+) | Utilities, server actions, formula engine |
   306 | **API endpoints** | Medium (60%+) | Integration tests for critical paths |
   307| **UI components** | Low-Medium (40-60%) | Component tests for interactive elements |
   308 | **Utilities** | High (80%+) | Unit tests for helper functions |
   309
   310
   311
   312 **Running coverage**:
   313
   314
   315
   316    ```bash
   317    npm test -- --coverage
   318    ```
   319
   320
   321
   322
   323
   324
   325 ## Best Practices
   326
   327
   328
   329 ### Test Behavior, Not Implementation
   330
   331 Tests should verify **what** the code does, not **how** it's implemented.
   332
   333
   334 - **Good**: Test that clicking button triggers callback
   335- **Bad**: Test that component calls setState
   336
   337
   338
   339
   340
   341 ### One Assertion Per Test (When Practical)
   342
   343 Keep tests focused on one specific behavior. When testing multiple related behaviors, use separate tests.
   344
   345
   346
   347
   348
   349
   350
   351
   352
   353 ### Descriptive Test Names
   354
   355 Use clear, descriptive test names that explain what's being tested:
   356
   357
   358 - **Good**: `should return error for missing name`
   359- **Bad**: `test1`, `handles error`
   360
   361
   362
   363
   364
   365
   366
   367
   368
   369 ### Arrange-Act-Assert Pattern
   370
   371 Structure tests with three phases:
   372
   373
   374
   375
   376
   377
   378 - **Arrange**: Set up test data and mocks
   379- **Act**: Execute the function or interaction
   380- **Assert**: Verify the result
   381
   382
   383
   384
   385
   386
   387
   388
   389
   390
   391
   392
   393
   394
   395 ### Keep Tests Fast and Isolated
   396
   397 Tests should run quickly and not depend on external state:
   398
   399
   400
   401
   402 - **Fast**: No network calls, minimal database operations
   403- **Isolated**: Each test is independent of others
   404- **Repeatable**: Same test should produce same result every time
   405
   406
   407
   408
   409
   410
   411
   412
   413
   414
   415
   416
   417
   418
   419
   420
   421
   422
   423
   424
   425
   426
   427
   428 ## Test Examples
   429
   430
   431
   432 ### Example: Testing Formula Engine
   433
   434
   435
   436
   437
   438    ```typescript
   439    import { describe, it, expect } from 'vitest'
   440    import { evaluateFormula } from './formula-engine'
   441
   442    describe('evaluateFormula', () => {
   443      it('should evaluate simple arithmetic', () => {
   444        const result = evaluateFormula('1 + 2', {})
   445        expect(result).toBe(3)
   446      })
   447
   448
   449      it('should handle entity field references', () => {
   450        const result = evaluateFormula('deal.value * 0.1', {
   451          deal: { value: 1000 }
   452        })
   453        expect(result).toBe(100)
   454      })
   455
   456
   457      it('should handle null propagation', () => {
   458        const result = evaluateFormula('null_value + 1', {
   459          null_value: null
   460        })
   461        expect(result).toBe(null)
   462      })
   463
   464
   465      it('should handle DATE function', () => {
   466        const result = evaluateFormula('DATE()', {})
   467        expect(result).toBeInstanceOf(Date)
   468      })
   469
   470
   471      it('should handle nested function calls', () => {
   472        const result = evaluateFormula('IF(deal.value > 10000, "High", "Low")', {
   473          deal: { value: 15000 }
   474        })
   475        expect(result).toBe('High')
   476      })
   477
   478
   479
   480      it('should handle errors gracefully', () => {
   481        expect(() => {
   482          evaluateFormula('invalid syntax', {})
   483        }).toThrow()
   484      })
   485    })
    486    ```
    487
   488
   489
   490
   491
   492
   493 ## Debugging Tests
   494
   495
   496
   497 When tests fail, use these techniques:
   498
   499
   500
   501 - **Use test.each**: Test multiple inputs with a single test definition
   502    ```typescript
   503    it.each([[1, 1], [2, 2], [3, 3]], (input, expected) => {
   504      expect(input + input).toBe(expected)
   505    })
   506    ```
   507
   508 - **console.log in tests**: Add debug output when needed
   509    ```typescript
   510    it('debug example', () => {
   511      const result = complexFunction()
   512      console.log('Result:', result) // Remove after debugging
   513      expect(result).toBe(true)
   514    })
    515    ```
   516
   517
   518
   519
   520
   521 - **VS Code debugger**: Set breakpoints in test files for interactive debugging
   522
   523
   524
   525
   526
   527 ## Continuous Integration
   528
   529
   530 Run tests before committing:
   531
   532
   533
   534    ```bash
   535    # Run all tests
   536    npm test
   537
   538    # Fix failing tests before commit
   539    git commit --amend --no-edit
   540    ```
   541
   542
   543
   544
   545
   546
   547
   548 ---
   549
   550 *Last updated: 2026-03-04*
   551
   552    See also:
   553    - [Architecture Overview](./architecture.md) - System architecture
   554    - [Code Style Guide](./code-style.md) - Coding conventions
   555    - [Contributing Guide](./contributing.md) - Contribution workflow
