import type { Dictionary } from "./index";

const en = {
  metadata: {
    title: "Dawah",
    description:
      "Manage event invitations, responses, and attendance through WhatsApp.",
  },
  common: {
    wordmark: "دعوة",
    wordmarkLatin: "DAWAH",
    homeLabel: "Dawah home",
    close: "Close",
    retry: "Try again",
    cancel: "Cancel",
    language: "Language",
    arabic: "العربية",
    english: "English",
  },
  auth: {
    eyebrow: "Event management dashboard",
    title: "Sign in",
    intro:
      "Use the mobile number linked to your account. We will send a one-time verification code.",
    privacy: "By signing in, you agree to the terms of use and privacy notice.",
    artLabel: "About Dawah",
    artQuote:
      "From the invitation list to attendance confirmation, everything stays in one place.",
    fact1Value: "1",
    fact1Label: "invitation group per WhatsApp number",
    fact2Value: "2",
    fact2Label: "separate response and delivery states",
    fact3Value: "3",
    fact3Label: "accurate expected-attendee counting",
    phoneLabel: "Mobile number",
    phoneHint: "Example: +9665XXXXXXXX",
    phoneValidation: "Enter a valid number in international format.",
    sendCode: "Send verification code",
    codeLabel: "Verification code",
    codeHint: "Code sent to {phone}",
    codeValidation: "Enter the 6-digit verification code.",
    verifyCode: "Verify code",
    changePhone: "Change mobile number",
    providerMissing:
      "The sign-in provider is not configured. Add the Supabase settings to the local environment.",
    providerMissingShort: "The sign-in provider is not configured.",
    sendFailed:
      "The verification code could not be sent. Check the number and try again.",
    invalidCode: "The verification code is incorrect or has expired.",
    developmentTitle: "Local test environment",
    developmentNote:
      "Temporary mobile verification bypass. It cannot run in production.",
    developmentLogin: "Use test access",
  },
  events: {
    metadataTitle: "Events",
    navigationLabel: "Primary navigation",
    eyebrow: "Management dashboard",
    title: "Events",
    intro:
      "Create an event or open an existing event to manage invitations and attendance.",
    create: "Create event",
    signOut: "Sign out",
    setupMissing:
      "Sign-in is not configured. Add the Supabase environment values and restart the application.",
    loading: "Loading events",
    loadErrorTitle: "Events could not be loaded",
    loadErrorDescription: "Check the API connection, then try again.",
    emptyTitle: "No events yet",
    emptyDescription:
      "Create the first event, then add invitation groups and define who each invitation includes.",
    emptyAction: "Create the first event",
    wedding: "Wedding",
    date: "Date",
    location: "Location",
    open: "Open event",
    dialogTitle: "Create event",
    dialogDescription:
      "Enter the essential information. Invitation settings can be changed later.",
    save: "Save event",
    nameAr: "Event name in Arabic",
    nameArPlaceholder: "Khalid and Noura's wedding",
    eventDate: "Event date",
    startTime: "Start time",
    endTime: "End time",
    venueNameAr: "Venue name",
    city: "City",
    defaultCity: "Riyadh",
    rsvpDeadline: "RSVP deadline",
    invalidField: "Check this value.",
    saveError:
      "The event could not be saved. Check the data and connection, then try again.",
    statusUpcoming: "Upcoming",
    statusRsvpOpen: "RSVP open",
    statusRsvpClosed: "RSVP closed",
    statusToday: "Today",
    statusCompleted: "Completed",
    statusArchived: "Archived",
  },
  shell: {
    collapse: "Collapse navigation",
    expand: "Expand navigation",
  },
} satisfies Dictionary;

export default en;
