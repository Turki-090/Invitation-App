---
name: dawah-design
description: Use this skill to generate well-branded interfaces and assets for Dawah (WhatsApp-first wedding & event invitation platform, Arabic-first/RTL, Saudi–GCC), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, and explore the other available files (tokens/, components/, ui_kits/, guidelines/).
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Non-negotiables when designing for Dawah:
- Arabic RTL is the source layout; English is derived. Phone numbers stay LTR (`.phone`).
- Counts always name their unit: invitation groups vs named guests vs expected people.
- RSVP status and WhatsApp delivery status are separate pills (`StatusPill kind`).
- Status = icon + text + colour, never colour alone.
- Dashboard is calm and neutral (ink primary, bronze rationed); only the guest invitation is expressive (Amiri, cream, gold).
- Guest RSVP buttons are 60px tall, stacked, full width; guest text ≥17px.
