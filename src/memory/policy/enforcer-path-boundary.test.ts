/**
 * Path matching for memory policy rules must respect path segment boundaries.
 * A grant for "notes" must not authorise "notes-secrets/x" or "notes2/secret".
 */

import { describe, it, expect } from "bun:test"
import { matchesPath } from "./enforcer"

describe("matchesPath segment boundaries", () => {
  it("matches the exact path", () => {
    expect(matchesPath("notes", "notes")).toBe(true)
  })

  it("matches nested paths below the grant", () => {
    expect(matchesPath("notes", "notes/x")).toBe(true)
    expect(matchesPath("notes", "notes/deep/nested.md")).toBe(true)
  })

  it("rejects sibling paths that only share a prefix", () => {
    expect(matchesPath("notes", "notes-secrets/x")).toBe(false)
    expect(matchesPath("notes", "notes2/secret")).toBe(false)
    expect(matchesPath("notes", "notesx")).toBe(false)
    expect(matchesPath("notes", "notes-secrets")).toBe(false)
  })

  it("keeps glob patterns working", () => {
    expect(matchesPath("notes/*", "notes/x")).toBe(true)
    expect(matchesPath("notes/*", "notes-secrets/x")).toBe(false)
    expect(matchesPath("**", "anything/at/all")).toBe(true)
    expect(matchesPath("*", "anything")).toBe(true)
    expect(matchesPath(undefined, "anything")).toBe(true)
  })
})
