import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Avatar,
  Banner,
  Button,
  Card,
  Checkbox,
  ChoiceCard,
  GuestShell,
  HostShell,
  IconButton,
  ProgressBar,
  StatCard,
  Stepper,
} from "../../../packages/ui/src";

const meta = {
  title: "Foundations/Layouts",
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const navigation = {
  ar: [
    {
      id: "overview",
      label: "نظرة عامة",
      href: "#overview",
      icon: "layout-dashboard" as const,
      active: true,
    },
    {
      id: "guests",
      label: "المدعوون",
      href: "#guests",
      icon: "users" as const,
    },
    {
      id: "sending",
      label: "الإرسال",
      href: "#sending",
      icon: "send" as const,
      badge: 3,
    },
    {
      id: "reports",
      label: "التقارير",
      href: "#reports",
      icon: "chart-bar" as const,
    },
    {
      id: "settings",
      label: "الإعدادات",
      href: "#settings",
      icon: "settings" as const,
    },
  ],
  en: [
    {
      id: "overview",
      label: "Overview",
      href: "#overview",
      icon: "layout-dashboard" as const,
      active: true,
    },
    { id: "guests", label: "Guests", href: "#guests", icon: "users" as const },
    {
      id: "sending",
      label: "Sending",
      href: "#sending",
      icon: "send" as const,
      badge: 3,
    },
    {
      id: "reports",
      label: "Reports",
      href: "#reports",
      icon: "chart-bar" as const,
    },
    {
      id: "settings",
      label: "Settings",
      href: "#settings",
      icon: "settings" as const,
    },
  ],
};

function Dashboard({ locale }: { locale: "ar-SA" | "en" }) {
  const arabic = locale === "ar-SA";
  return (
    <div dir={arabic ? "rtl" : "ltr"} lang={locale}>
      <HostShell
        brand={
          <span className="wordmark">
            <span>دعوة</span>
            <small>DAWAH</small>
          </span>
        }
        collapseLabel={arabic ? "طي شريط التنقل" : "Collapse navigation"}
        compactUtility={
          <IconButton
            label={arabic ? "تسجيل الخروج" : "Sign out"}
            name="log-out"
          />
        }
        expandLabel={arabic ? "توسيع شريط التنقل" : "Expand navigation"}
        items={arabic ? navigation.ar : navigation.en}
        navigationLabel={arabic ? "التنقل الرئيسي" : "Primary navigation"}
        topbar={
          <>
            <strong>
              {arabic ? "حفل زواج خالد ونورة" : "Khalid and Noura's wedding"}
            </strong>
            <Avatar name={arabic ? "خالد العمري" : "Khalid Al-Omari"} />
          </>
        }
        utility={
          <Button fullWidth icon="log-out" variant="ghost">
            {arabic ? "تسجيل الخروج" : "Sign out"}
          </Button>
        }
      >
        <div style={{ display: "grid", gap: 24 }}>
          <header className="page-header">
            <div>
              <p className="eyebrow">
                {arabic ? "لوحة الإدارة" : "Management dashboard"}
              </p>
              <h1>{arabic ? "نظرة عامة" : "Overview"}</h1>
              <p>
                {arabic
                  ? "ملخص الدعوات والحضور المتوقع."
                  : "Invitation and expected-attendance summary."}
              </p>
            </div>
            <Button icon="plus">
              {arabic ? "إضافة مجموعة دعوات" : "Add invitation group"}
            </Button>
          </header>
          <Banner
            actionLabel={arabic ? "مراجعة" : "Review"}
            kind="warning"
            title={
              arabic ? "٣ مجموعات بانتظار الإجراء" : "3 groups need attention"
            }
          />
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            }}
          >
            <StatCard
              context={arabic ? "مجموعة دعوات" : "invitation groups"}
              label={arabic ? "الدعوات" : "Invitations"}
              locale={locale}
              value={120}
            />
            <StatCard
              context={arabic ? "شخصًا متوقعًا" : "people expected"}
              label={arabic ? "الحضور المتوقع" : "Expected attendance"}
              locale={locale}
              tone="accepted"
              value={184}
            />
          </div>
          <Card title={arabic ? "حالة الردود" : "RSVP status"}>
            <ProgressBar
              ariaLabel={arabic ? "توزيع الردود" : "RSVP distribution"}
              locale={locale}
              segments={[
                {
                  label: arabic ? "قبول" : "Accepted",
                  tone: "accepted",
                  value: 89,
                },
                {
                  label: arabic ? "بانتظار الرد" : "Pending",
                  tone: "pending",
                  value: 24,
                },
                {
                  label: arabic ? "اعتذار" : "Declined",
                  tone: "declined",
                  value: 7,
                },
              ]}
            />
          </Card>
        </div>
      </HostShell>
    </div>
  );
}

export const HostArabicDesktop: Story = {
  globals: { locale: "ar-SA" },
  render: () => <Dashboard locale="ar-SA" />,
};

export const HostEnglishDesktop: Story = {
  globals: { locale: "en" },
  render: () => <Dashboard locale="en" />,
};

export const HostEnglishCollapsed: Story = {
  globals: { locale: "en" },
  parameters: { viewport: { defaultViewport: "tablet" } },
  render: () => <Dashboard locale="en" />,
};

export const HostMobile: Story = {
  globals: { locale: "ar-SA" },
  parameters: { viewport: { defaultViewport: "mobile" } },
  render: () => <Dashboard locale="ar-SA" />,
};

function GuestRsvp({ locale }: { locale: "ar-SA" | "en" }) {
  const arabic = locale === "ar-SA";
  return (
    <div dir={arabic ? "rtl" : "ltr"} lang={locale}>
      <GuestShell
        eyebrow={
          arabic ? "بسم الله الرحمن الرحيم" : "Together with their families"
        }
        footer={
          arabic
            ? "يرجى تأكيد الحضور قبل ١٥ أكتوبر"
            : "Please respond by 15 October"
        }
        subtitle={
          arabic
            ? "يسرّنا دعوتكم لحضور حفل زواجنا"
            : "We warmly invite you to celebrate our wedding"
        }
        title={arabic ? "خالد ونورة" : "Khalid & Noura"}
      >
        <div
          aria-label={arabic ? "اختيار الرد" : "Choose a response"}
          role="radiogroup"
          style={{ display: "grid", gap: 12 }}
        >
          <ChoiceCard
            selected
            size="guest"
            title={arabic ? "سأحضر" : "I will attend"}
          />
          <ChoiceCard
            size="guest"
            title={arabic ? "أعتذر عن الحضور" : "I cannot attend"}
          />
        </div>
        <Checkbox
          defaultChecked
          label={arabic ? "نورة" : "Noura"}
          size="guest"
        />
        <Stepper
          decrementLabel={arabic ? "مرافق أقل" : "Remove companion"}
          groupLabel={arabic ? "عدد المرافقين" : "Companion count"}
          incrementLabel={arabic ? "مرافق أكثر" : "Add companion"}
          onChange={() => undefined}
          size="guest"
          value={1}
        />
        <Button fullWidth size="guest" variant="guest-primary">
          {arabic ? "تأكيد الحضور" : "Confirm attendance"}
        </Button>
      </GuestShell>
    </div>
  );
}

export const GuestArabic: Story = {
  globals: { locale: "ar-SA" },
  parameters: { viewport: { defaultViewport: "mobile" } },
  render: () => <GuestRsvp locale="ar-SA" />,
};

export const GuestEnglish: Story = {
  globals: { locale: "en" },
  parameters: { viewport: { defaultViewport: "mobile" } },
  render: () => <GuestRsvp locale="en" />,
};
