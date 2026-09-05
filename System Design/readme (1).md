# Dawah Invitations — Design System

> Working title. "Dawah" (دعوة, *invitation*) is a placeholder — no brand name, logo, or reference screens were supplied. Replace when the real brand exists.

## Product context

A WhatsApp-first digital invitation platform for weddings and private events in Saudi Arabia / the GCC. Two very different audiences share one system:

- **Hosts** (event owner, co-hosts, check-in staff) — a calm, neutral, desktop-first responsive dashboard: events home, overview, guests, invitations/sending center, reminders, check-in, team, reports, settings, billing.
- **Guests** — never install anything. They receive a WhatsApp message with RSVP buttons, and can optionally open a phone-first, no-login **visual invitation** (the only expressive, wedding-themed surface).

Arabic is the source layout (RTL). English LTR is derived from it, not the other way around.

### Core business vocabulary (never blur these)
- **Invitation group** — one WhatsApp number, the unit of sending. Three types: **Single person**, **Named group / family** (members chosen individually → *Partially accepted*), **Person + companions** ("Me + 2").
- **Named guest** — an individual inside a group.
- **Expected attendee** — the number that actually shows up in the count.
- **RSVP status** (not sent · pending · accepted · partially accepted · declined) is *separate* from **delivery status** (draft · ready · queued · sent · delivered · read · responded · failed · cancelled). Never merge them into one pill.
- Counts always carry context: "450 invitation groups", "620 named guests", "497 people expected" — never "450 guests".

### Sources
- Product & UX brief pasted in chat (50 sections: concept, roles, invitation types, RSVP/message lifecycles, screen inventory, palette, type, RTL and accessibility rules). No Figma, codebase, or reference screenshots were attached to the project despite the brief referring to "reference screens" — visual direction below is derived from the brief's palette/type spec.

## Content fundamentals

Two voices, never mixed.

**Host dashboard — short, factual, calm.** Sentence case, no exclamation marks, no emoji, no playful SaaS copy. Every number carries its unit and the unit names the entity: "٨٩ مجموعة دعوات بانتظار الرد." / "89 invitation groups awaiting response." — "٣ رسائل فشل إرسالها." — "٤٩٧ شخصًا متوقع حضورهم." Problems are stated once and paired with the action that fixes them ("3 messages failed → Review failed messages"). Confirmations restate scope and consequence before high-impact actions: "Send 400 invitations now?", "This guest has already responded.", "You sent these guests a reminder yesterday." Toasts name the outcome and count ("تم إرسال ٢٩ دعوة"), never "Success!". Manual changes are attributed by name in history ("RSVP changed manually by Khalid Al-Omari"). Address the host as "you" only when necessary; prefer impersonal statements.

**Guest invitation & WhatsApp — warm, formal, welcoming.** Classical Arabic register, plural of respect (دعوتكم، حضوركم): "بمشيئة الله يسرّنا دعوتكم لحضور حفل زواجنا", "يشرفنا حضوركم ومشاركتنا الفرحة". Responses are gracious both ways: "تم تأكيد حضورك" / "تم تسجيل اعتذارك، شكرًا لإبلاغنا." Simple wording an elderly guest reads once. Actions are complete phrases on large buttons ("سأحضر", "أعتذر عن الحضور", "أنا + ٢") — never "OK/Cancel". Closed and completed states explain themselves ("انتهت فترة تأكيد الحضور… يرجى التواصل مع صاحب المناسبة") instead of showing disabled buttons.

**Numerals.** Arabic UI uses Arabic-Indic digits (١٢٣) for counts via `formatNum(n,'ar')`; phone numbers, codes and IDs are always LTR Western digits in mono (`.phone`). English uses Western digits throughout.

## Visual foundations

- **Palette.** Warm paper `#FBF9F6` app background, white cards, ink `#17140F` text, secondary `#544B41`, muted `#8C8378`. Borders are warm (`#E9E3DA`), never cool grey. Bronze `#9A7642` is the only accent and is rationed: one key CTA per screen (`Button variant="accent"`), focus ring, selected-state tint, credits card, invitation gold. Primary buttons are **ink**, not bronze.
- **Status colours** come in triplets (fill / bg / fg): accepted muted green, partial muted blue, declined muted red, pending amber, not-sent grey, checked-in teal. Status is always icon + text + colour (`StatusPill`); a lone dot is only used on `StatCard` next to a label.
- **WhatsApp greens** and **invitation cream/deep/gold** are quarantined to their surfaces.
- **Type.** IBM Plex Sans Arabic for everything host-side (Latin falls to IBM Plex Sans); Amiri (Latin: Cormorant Garamond) for guest invitation headings only; IBM Plex Mono for phones/codes. Dashboard body 14–15px, line-height 1.6 (Arabic needs air); metrics 30–38px semibold with tabular numerals; guest text ≥17px, display 34–60px. Latin small-caps labels track `.08em`; Arabic never letter-spaces.
- **Spacing.** 4px base. Card padding 20, page gutter 24, section gaps 14–20 between cards, 32 between page regions. Sidebar 264 (72 collapsed), top bar 60, drawer 480, guest viewport 390.
- **Radii.** Controls 10, cards 14, dialogs 20, pills full, guest buttons 14, phone frames 38.
- **Surfaces & elevation.** Cards = white + 1px warm border + `--shadow-card` (almost invisible). Shadows grow only for popovers (`--shadow-raised`) and dialogs/drawers (`--shadow-overlay`). Sunken surfaces (`--sunken`) hold secondary info; the dark ink card is reserved for the event-day hero and auth art panel. No gradients, no textures, no imagery on the dashboard. The guest invitation is flat cream with thin gold rules and a small sparkle glyph as the only ornament — no floral illustrations were provided.
- **Backgrounds.** Solid paper. Scrim `rgba(23,20,15,.42)` behind dialogs/drawers. No blur.
- **Motion.** 120–180ms `cubic-bezier(.2,.7,.2,1)` colour/border transitions; 280ms for width changes (progress bars); 400ms allowed on guest surfaces. No bounces, no slides-in for content. Reduced-motion collapses durations to 0.
- **Hover / press.** Hover = one step darker fill (primary `#2B261F`, secondary → `--hover`); press = another step darker, no scale. Table rows tint `--hover`; selected rows tint bronze `--accent-soft`. Ghost buttons gain `--hover` fill only.
- **Focus.** 3px bronze ring at 28% (`--focus-ring`); invalid inputs use a red border + red ring.
- **Layout.** RTL is the source: sidebar on the right, tables align to reading start, numeric columns align end, chevrons/arrows mirror (`Icon flipRtl`). Sticky table header; fixed sidebar + top bar; content scrolls. Drawers slide from inline-end (left in RTL). <1100px sidebar collapses to icons; <800px bottom nav.
- **Transparency & blur.** Only the scrim and the 18% white pill on the active nav item. No glass.
- **Imagery.** None on the host side. Guest invitation would carry the couple's chosen template artwork — none supplied; placeholders are plain cream.

## Iconography

Lucide (outline, 1.75px stroke, 24-grid) loaded from CDN (`https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js`) and rendered through `components/core/Icon.jsx` by kebab-case name. This is a **substitution**: no icon set was provided. Sizes: 14 in pills, 16–18 in buttons/nav, 20–24 in guest UI and empty states. Directional icons must pass `flipRtl`. Icons are never used without a text label except in `IconButton`, which requires `label`. No emoji anywhere. No unicode glyphs as icons (the ✕ in Tag is an icon). Status vocabulary → icon mapping lives in `StatusPill.STATUS`. No logo exists — the wordmark is the word دعوة set in Amiri next to "DAWAH" in Plex; see `guidelines/brand-wordmark.html`.

## Components (`components/`)

Bundle namespace: `window.DawahInvitationsDesignSystem_51e74b`. Each has `.jsx`, `.d.ts`, `.prompt.md`; one specimen card per folder.

- **core/** — Icon, Button, IconButton, Avatar, Card, Tag, Tabs, Tooltip
- **forms/** — Field, Input, PhoneInput, Select, Checkbox, Radio, Switch, Stepper, ChoiceCard
- **feedback/** — Dialog, Toast, Banner, EmptyState, Skeleton
- **data/** — Num, Phone, StatusPill, StatCard, ProgressBar, Funnel, Timeline, Table

Intentional additions beyond a generic kit (all demanded by the brief): PhoneInput/Phone (LTR numbers), Num (Arabic-Indic digits), StatusPill (three separate status vocabularies), StatCard (unit-context rule), ProgressBar/Funnel (RSVP + WhatsApp visualisations), Timeline (delivery/activity), Stepper/ChoiceCard (companion counts, invitation-type selection), Banner (actionable attention cards).

## UI kits (`ui_kits/`)

- `host-dashboard/` — full RTL/LTR dashboard: overview (+ event-day mode), guests with add/details drawers, sending centre with WhatsApp previews and progress, reminders, check-in, team, reports, settings.
- `host-onboarding/` — sign in, OTP, events home, create-event wizard with WhatsApp connection states.
- `guest-invitation/` — 390px visual invitation, three types, open/closed/completed, QR pass.
- `whatsapp/` — invitation message + quick replies + acknowledgements per type.

## Index

- `styles.css` → `tokens/` (fonts, colors, typography, spacing, radii, shadows, motion, base)
- `guidelines/` — 16 specimen cards: Colors (neutrals, bronze, status, guest & WhatsApp), Type (UI Arabic, UI Latin, display, numerals, scale), Spacing (scale, radii, elevation, control heights), Brand (wordmark, two voices, RTL)
- `components/` — see above · `ui_kits/` — see above · `thumbnail.html` — homepage tile · `SKILL.md` — agent skill entry

## Caveats

- **No reference screens, Figma, or codebase were attached** — the brief mentions them; the whole visual layer is derived from the brief's palette/type spec. Attach them and the kits should be re-checked against them.
- **No brand name or logo.** "Dawah / دعوة" is a placeholder wordmark, not a logo.
- **Fonts are Google-served** (IBM Plex Sans Arabic, IBM Plex Sans, IBM Plex Mono, Amiri, Cormorant Garamond) via `@import`; no binaries shipped. Provide licensed files to self-host.
- **Icons are Lucide from CDN** — a substitution.
- QR codes in the guest kit are a CSS placeholder pattern, not real codes.
- Excel import, invitation template gallery/editor, billing and notification centre screens are not yet built in the kits (components cover them; screens pending).
