# ADR-001: API-first architecture

Status: accepted.

All clients use a versioned REST API. Essential business logic does not live exclusively in Next.js, browser state, or direct database clients. This keeps web and future native applications consistent.
