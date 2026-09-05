# Native application strategy

Future iOS and Android applications consume the same `/api/v1` contract as the web application. They reuse OpenAPI models, terminology, localization keys, flows, and generated design tokens—not React components.

The first native scope prioritizes event overview, guest search and edit, RSVP status, failed-message alerts, reminders, event-day check-in, QR scanning, and notifications. Spreadsheet import and advanced invitation editing remain web-first.

iOS uses SwiftUI, async/await, URLSession, and Keychain. Android uses Jetpack Compose, coroutines/Flow, a typed HTTP client, and Keystore-backed storage. Offline check-in eventually records local operations and synchronization state, then reconciles conflicts on the server without promising duplicate prevention while every device is offline.
