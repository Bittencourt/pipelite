# Testing Guide

This document covers testing practices and patterns in the Pipelite codebase.

## Overview

Pipelite uses **Vitest** as the test framework. Tests are co-located with source files and follow the pattern: `*.test.ts` or `*.spec.ts` files placed next to the modules they test.

## Test Structure

- **Test files**: Named `*.test.ts` or `*.spec.ts` (e.g., `formula-engine.test.ts`)
- **Co-location**: Place test files next to source files
- **Example**: `src/lib/formula-engine.ts` and `src/lib/formula-engine.test.ts`

## Running Tests

```bash
# Run all tests
npm test

# Run in watch mode (re-runs on file changes)
npm test -- --watch

# Run specific test file
npm test src/lib/formula-engine.test.ts

# Run with coverage report
npm test -- --coverage
```

## Writing Unit Tests

```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from './module'

describe('functionToTest', () => {
  it('should handle normal case', () => {
    const result = functionToTest('input')
    expect(result).toBe('expected')
  })

  it('should handle edge case', () => {
    const result = functionToTest(null)
    expect(result).toBe('expected for null')
  })

  it('should throw on invalid input', () => {
    expect(() => functionToTest(undefined)).toThrow()
  })
})
```

### Test Organization

- **describe block**: Group related tests
- **it blocks**: Individual test cases
- **Descriptive names**: Test names should describe behavior
- **One concept per test**: Each test should verify one specific behavior

## Testing Server Actions

Server actions require mocking database calls and testing both success and error paths:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createOrganization } from './actions/organization'

// Mock database
vi.mock('./lib/db', () => ({
  db: {
    insert: vi.fn(),
    query: vi.fn(),
  }
}))

describe('createOrganization', () => {
  it('should create organization successfully', async () => {
    const mockDb = vi.mocked('./lib/db')
    mockDb.insert.mockResolvedValue([{ id: 'org-123' }])

    const formData = new FormData()
    formData.append('name', 'Test Org')

    const result = await createOrganization(formData)

    expect(result).toEqual({ success: true, id: 'org-123' })
    expect(mockDb.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Test Org' })
    )
  })

  it('should return error for missing name', async () => {
    const formData = new FormData()
    // name is missing

    const result = await createOrganization(formData)

    expect(result).toEqual({
      success: false,
      error: 'Name is required'
    })
  })
})
```

### Key Points

- **Mock database calls**: Use `vi.mock()` for database operations
- **Test both paths**: Verify success and error scenarios
- **Validate return format**: Check that return value matches expected pattern
- **Test validation**: Ensure input validation works correctly

## Testing Components

Use `@testing-library/react` for testing React components:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)

    fireEvent.click(screen.getByText('Click me'))

    expect(onClick).toHaveBeenCalled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>)

    expect(screen.getByText('Click me')).toBeDisabled()
  })
})
```

### Key Points

- **Test user interactions**: Focus on what users do, not implementation details
- **Use accessible queries**: Prefer `getByRole`, `getByText` over test IDs
- **Mock external dependencies**: Mock imports for server components or hooks
- **Test accessibility**: Verify keyboard navigation and screen readers

## Testing Utilities

Pure utility functions are straightforward to test. Focus on edge cases:

```typescript
import { describe, it, expect } from 'vitest'
import { formatDate, formatCurrency } from './utils/format'

describe('formatDate', () => {
  it('formats date correctly', () => {
    const date = new Date('2024-01-15')
    const result = formatDate(date, 'en-US')
    expect(result).toBe('January 15, 2024')
  })

  it('handles null dates', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US')
    expect(result).toBe('$1,234.56')
  })

  it('formats EUR correctly', () => {
    const result = formatCurrency(1234.56, 'EUR', 'de-DE')
    expect(result).toBe('1.234,56 \u20ac')
  })

  it('handles null values', () => {
    expect(formatCurrency(null, 'USD', 'en-US')).toBe('')
  })
})
```

### Key Points

- **Test pure functions**: No mocking needed for most utilities
- **Test edge cases**: Include null, undefined, empty string, invalid formats
- **Test multiple locales**: Verify internationalization support
- **Use descriptive names**: Test names should describe expected behavior

## Test Coverage

| Area | Target | Focus |
|------|--------|-------|
| **Business logic** | High (80%+) | Utilities, server actions, formula engine |
| **API endpoints** | Medium (60%+) | Integration tests for critical paths |
| **UI components** | Low-Medium (40-60%) | Component tests for interactive elements |
| **Utilities** | High (80%+) | Unit tests for helper functions |

**Running coverage**:

```bash
npm test -- --coverage
```

## Best Practices

### Test Behavior, Not Implementation

Tests should verify **what** the code does, not **how** it's implemented.

- **Good**: Test that clicking button triggers callback
- **Bad**: Test that component calls setState

### One Assertion Per Test (When Practical)

Keep tests focused on one specific behavior. When testing multiple related behaviors, use separate tests.

### Descriptive Test Names

Use clear, descriptive test names that explain what's being tested:

- **Good**: `should return error for missing name`
- **Bad**: `test1`, `handles error`

### Arrange-Act-Assert Pattern

Structure tests with three phases:

- **Arrange**: Set up test data and mocks
- **Act**: Execute the function or interaction
- **Assert**: Verify the result

### Keep Tests Fast and Isolated

Tests should run quickly and not depend on external state:

- **Fast**: No network calls, minimal database operations
- **Isolated**: Each test is independent of others
- **Repeatable**: Same test should produce same result every time

## Test Examples

### Example: Testing Formula Engine

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateFormula } from './formula-engine'

describe('evaluateFormula', () => {
  it('should evaluate simple arithmetic', () => {
    const result = evaluateFormula('1 + 2', {})
    expect(result).toBe(3)
  })

  it('should handle entity field references', () => {
    const result = evaluateFormula('deal.value * 0.1', {
      deal: { value: 1000 }
    })
    expect(result).toBe(100)
  })

  it('should handle null propagation', () => {
    const result = evaluateFormula('null_value + 1', {
      null_value: null
    })
    expect(result).toBe(null)
  })

  it('should handle DATE function', () => {
    const result = evaluateFormula('DATE()', {})
    expect(result).toBeInstanceOf(Date)
  })

  it('should handle nested function calls', () => {
    const result = evaluateFormula('IF(deal.value > 10000, "High", "Low")', {
      deal: { value: 15000 }
    })
    expect(result).toBe('High')
  })

  it('should handle errors gracefully', () => {
    expect(() => {
      evaluateFormula('invalid syntax', {})
    }).toThrow()
  })
})
```

## Debugging Tests

When tests fail, use these techniques:

- **console.log in tests**: Add debug output when needed
- **VS Code debugger**: Set breakpoints in test files for interactive debugging
- **`test.only`**: Focus on a single failing test

## Continuous Integration

Run tests before committing:

```bash
# Run all tests
npm test

# Run linting
npm run lint
```

---

*Last updated: 2026-03-04*

See also:
- [Architecture Overview](./architecture.md) - System architecture
- [Code Style Guide](./code-style.md) - Coding conventions
- [Contributing Guide](./contributing.md) - Contribution workflow
