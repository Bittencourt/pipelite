# Notes API

## Overview

Notes are free-text entries attached to a CRM record. Every organization, person, deal and
activity has its own note timeline, and notes are exposed as a **nested sub-resource** of the
record they belong to:

```
GET|POST  /api/v1/organizations/{id}/notes
GET|POST  /api/v1/people/{id}/notes
GET|POST  /api/v1/deals/{id}/notes
GET|POST  /api/v1/activities/{id}/notes

PATCH     /api/v1/notes/{noteId}
DELETE    /api/v1/notes/{noteId}
```

Creating and reading a note is scoped to its parent record, so the collection URL carries the
parent ID. Editing and deleting are addressed by the note's own ID, because a note ID is already
globally unique and repeating the parent in the URL would let a caller pair a note with the wrong
record.

**Base URL:** `https://your-domain.com/api/v1`

All endpoints require Bearer API-key authentication and are rate limited exactly like every other
`/api/v1` endpoint. See [Authentication](./authentication.md) and
[Error Handling](./error-handling.md#rate-limiting).

## The Note Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Note ID |
| `entity_type` | string | One of `organization`, `person`, `deal`, `activity` |
| `entity_id` | string | ID of the record the note is attached to |
| `content` | string | Note body. Internal line breaks are preserved; surrounding whitespace is trimmed |
| `author_id` | string \| null | User who wrote the note. `null` for a migrated note with no identifiable author |
| `source` | string | `user` for a note written through Pipelite or this API, `migration` for a note carried over from a legacy notes field |
| `created_at` | string | ISO 8601 timestamp |
| `updated_at` | string | ISO 8601 timestamp. Equal to `created_at` until the note is edited |

```json
{
  "id": "note_abc123",
  "entity_type": "deal",
  "entity_id": "deal_xyz789",
  "content": "Called the buyer — budget approved, sending the proposal Monday.",
  "author_id": "user_123",
  "source": "user",
  "created_at": "2026-02-01T10:30:00.000Z",
  "updated_at": "2026-02-01T10:30:00.000Z"
}
```

### Soft-deleted notes are never returned

Deleting a note is a **soft delete**: the row is retained so that migration reconciliation stays
correct, but it stops being visible everywhere. No endpoint in this API ever returns a
soft-deleted note, and the note object has no soft-delete field at all — a `PATCH` or `DELETE`
against a deleted note answers with the same `404` as a note ID that never existed, so the API
cannot be used to probe which IDs are real.

### Content limits

`content` must be at least 1 character after trimming and at most **200,000 characters**. The
ceiling is deliberately high: notes migrated from legacy per-record note fields can be very long
(the largest observed is over 131,000 characters), and a lower limit would make those notes
permanently uneditable.

## Listing Notes on a Record

`GET /{entity}/{id}/notes`

Returns the record's notes **newest first**, using the standard offset/limit envelope described in
[Pagination](./pagination.md). The response also carries an `X-Total-Count` header with the total
number of live notes on that record.

```bash
curl -H "Authorization: Bearer pk_live_xxx" \
  "https://your-domain.com/api/v1/deals/deal_xyz789/notes?offset=0&limit=50"
```

```json
{
  "data": [
    {
      "id": "note_abc123",
      "entity_type": "deal",
      "entity_id": "deal_xyz789",
      "content": "Called the buyer — budget approved.",
      "author_id": "user_123",
      "source": "user",
      "created_at": "2026-02-01T10:30:00.000Z",
      "updated_at": "2026-02-01T10:30:00.000Z"
    }
  ],
  "meta": { "total": 1, "offset": 0, "limit": 50 }
}
```

A `404` is returned when the parent record does not exist **or has been deleted**. A deleted
parent behaves exactly like a missing one.

## Creating a Note

`POST /{entity}/{id}/notes`

The body accepts `content` and nothing else. The author is always the user who owns the API key
— it cannot be supplied in the request, so a key cannot be used to forge a note attributed to
somebody else.

```bash
curl -X POST \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"content": "Follow-up scheduled for Thursday."}' \
  "https://your-domain.com/api/v1/people/person_456/notes"
```

Responds `201` with `{ "data": { ...note } }`.

| Status | Meaning |
|--------|---------|
| `201` | Note created |
| `404` | The parent record does not exist or has been deleted |
| `422` | Validation failed — empty content, or content over the ceiling. See [Error Handling](./error-handling.md) |

**Any authenticated API key may create a note on any record it can address.** Note creation is
not restricted to the record's owner; collaboration on a shared record is the point of a note
timeline.

## Editing a Note

`PATCH /notes/{noteId}`

```bash
curl -X PATCH \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"content": "Corrected: follow-up is Friday, not Thursday."}' \
  "https://your-domain.com/api/v1/notes/note_abc123"
```

Responds `200` with `{ "data": { ...note } }`. `updated_at` moves ahead of `created_at`, which is
what marks a note as edited in the Pipelite UI.

## Deleting a Note

`DELETE /notes/{noteId}`

```bash
curl -X DELETE \
  -H "Authorization: Bearer pk_live_xxx" \
  "https://your-domain.com/api/v1/notes/note_abc123"
```

Responds `204` with an empty body. The note is soft-deleted and immediately disappears from every
list, in this API and in the Pipelite UI.

## Who May Edit or Delete a Note

Unlike creation, editing and deleting are restricted:

| Caller | May edit / delete |
|--------|-------------------|
| The note's author | Yes |
| An admin | Yes, including notes written by anyone else |
| Any other user | No — `403` |

The role is read from the Pipelite user account that owns the API key. It is **not** taken from
the request, so sending a role in the body has no effect.

A note with `author_id: null` (a migrated note whose original author could not be identified) is
editable by admins only.

This rule is enforced on the server for both this API and the Pipelite web app — the two surfaces
share one implementation of the check, so they cannot disagree.

| Status | Meaning |
|--------|---------|
| `200` / `204` | Edited / deleted |
| `403` | Caller is neither the note's author nor an admin. No change is made |
| `404` | The note does not exist, or has already been deleted |
| `422` | Validation failed on `PATCH` |

## Relationship to the Legacy `notes` Field

Organizations, people, deals and activities each still expose a single `notes` string field on
their own resource. That field is **retained for backward compatibility only**: its contents were
migrated into this notes API, and the Pipelite application no longer reads or writes it. New
integrations should use the endpoints on this page. Do not treat the legacy field as a live
mirror of a record's note timeline — it is not updated when notes are created, edited or deleted.

## See Also

- [Pagination](./pagination.md) — the `offset`/`limit` contract used by the note collections
- [Error Handling](./error-handling.md) — RFC 7807 Problem Details for `403`, `404` and `422`
- [OpenAPI Specification](/api/v1/docs) — the authoritative machine-readable reference
