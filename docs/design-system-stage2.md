# Stage 2 design-system foundation

This document records the production port of the supplied Dawah Invitations design system. The source visual package remains under `System Design/`; `packages/ui` is the typed React implementation consumed by the web application and future host/guest journeys.

## Component coverage

| Family   | Production exports                                                                               |
| -------- | ------------------------------------------------------------------------------------------------ |
| Core     | `Icon`, `Button`, `IconButton`, `Avatar`, `Card`, `Tag`, `Tabs`, `Tooltip`                       |
| Forms    | `Field`, `Input`, `PhoneInput`, `Select`, `Checkbox`, `Radio`, `Switch`, `Stepper`, `ChoiceCard` |
| Feedback | `Dialog`, `Toast`, `Banner`, `EmptyState`, `Skeleton`                                            |
| Data     | `Num`, `Phone`, `StatusPill`, `StatCard`, `ProgressBar`, `Funnel`, `Timeline`, `Table`           |
| Layout   | `HostShell`, `Drawer`, `GuestShell`                                                              |

The 30 supplied component families are represented directly. Older names in the master specification map to the supplied-system equivalents: `DataTable` → `Table`, `ProgressMeter` → `ProgressBar`, `Badge` → `StatusPill` or `Tag`, `GuestTypeTag` → `Tag`, `SegmentedControl` → pill `Tabs`, and `SideNav` → `HostShell`. Guest RSVP buttons are the `guest-primary` and `guest-secondary` `Button` variants.

## Localization and direction

- Public web routes start with `/ar-SA` or `/en`. Requests without a locale are redirected using `Accept-Language`, with `ar-SA` as the fallback.
- Dictionaries live in `apps/web/i18n/dictionaries`. Their key parity is tested. Reusable UI components receive visible and accessible copy through props; they contain no product-language strings.
- The locale layout sets both `lang` and `dir`. CSS uses logical properties. Directional icons opt into RTL mirroring.
- `Num` renders Arabic-Indic digits for Arabic product counts. `Phone`, `PhoneInput`, codes, and identifiers remain LTR, Western-digit, and monospaced.

## Responsive contract

- At desktop width the host navigation occupies the reading-side edge: right in RTL and left in LTR.
- Below 1100 px the host navigation collapses to its icon rail. At 800 px and below it is replaced with a fixed bottom navigation bar.
- Responsive tables can provide `renderMobile`; below 900 px, accessible cards replace the wide table.
- `Drawer` is modal and attaches to `inline-end`, which is left in RTL and right in LTR.
- Guest surfaces target a 390 px viewport, 17 px minimum body copy, 60 px RSVP buttons, 56 px steppers, and 28 px guest checkboxes.

## Accessibility contract

- Interactive components expose native controls or documented ARIA patterns, visible focus, disabled state, and minimum touch targets.
- `Tabs` implements roving focus with Left/Right, Home, and End keys. `ChoiceCard` radio groups implement roving focus with arrow, Home, and End keys; native selection controls retain platform keyboard behavior.
- `Dialog` and `Drawer` use the native modal dialog focus trap, close on Escape through a controlled callback, and restore focus through the platform dialog behavior.
- Statuses never rely on color alone. Every status includes text and an icon. Progress and funnel visualizations have explicit accessible labels.
- Component tests run axe-core and keyboard/selection checks. Storybook browser tests run WCAG 2 A/AA and WCAG 2.1 A/AA axe rules across 22 locale-and-viewport cases spanning all 15 stories.

## Storybook and visual verification

Run the following from the repository root:

```bash
pnpm storybook
pnpm storybook:build
pnpm test:storybook
```

The locale toolbar switches every catalogue story between Arabic RTL and English LTR. The stories cover desktop, collapsed navigation, mobile, loading, empty, error, disabled, keyboard focus, destructive dialog, and details drawer states. Playwright compares 20 host, guest, component-catalogue, and state renders to committed RTL/LTR screenshots; update them intentionally with `pnpm --filter @dawah/web exec playwright test --update-snapshots=all` after an approved visual change.

## Fonts

IBM Plex Sans Arabic, IBM Plex Sans, IBM Plex Mono, Amiri, and Cormorant Garamond are packaged through pinned Fontsource dependencies in `@dawah/ui`. Production pages and Storybook emit local font assets and make no runtime request to Google Fonts.
