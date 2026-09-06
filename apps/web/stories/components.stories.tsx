import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Avatar,
  Banner,
  Button,
  Card,
  Checkbox,
  ChoiceCard,
  EmptyState,
  Field,
  Funnel,
  Icon,
  IconButton,
  Input,
  Num,
  Phone,
  PhoneInput,
  ProgressBar,
  Radio,
  Select,
  Skeleton,
  StatCard,
  StatusPill,
  Stepper,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Toast,
  Tooltip,
} from "../../../packages/ui/src";
import { useState } from "react";

const meta = {
  title: "Foundations/Component catalogue",
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Production component catalogue derived from the supplied Dawah design system. Toggle the locale toolbar to verify RTL and LTR behavior.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: 16, marginBottom: 32 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function CoreCatalogue() {
  const [tab, setTab] = useState("all");
  return (
    <div>
      <Section title="Identity and actions">
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <Icon name="calendar" />
          <Avatar name="نورة العتيبي" />
          <Avatar name="Khalid Al-Omari" tone="dark" />
          <Button>Primary action</Button>
          <Button variant="accent">Accent action</Button>
          <Button loading>Loading action</Button>
          <IconButton label="Notifications" name="bell" badge={3} />
          <Tag tone="accent">Family</Tag>
          <Tag onRemove={() => undefined} removeLabel="Remove family tag">
            Family
          </Tag>
          <Tooltip label="Open event details">
            <IconButton label="Details" name="info" variant="outline" />
          </Tooltip>
        </div>
      </Section>
      <Section title="Navigation and surfaces">
        <Tabs
          ariaLabel="RSVP filters"
          items={[
            { id: "all", label: "All", count: 120 },
            { id: "accepted", label: "Accepted", count: 84 },
            { id: "pending", label: "Pending", count: 36 },
          ]}
          onChange={setTab}
          value={tab}
        />
        <Card
          title="Invitation groups"
          subtitle="Counts retain their business unit"
        >
          <p style={{ margin: 0 }}>120 invitation groups · 184 named guests</p>
        </Card>
      </Section>
    </div>
  );
}

export const Core: Story = {
  render: () => <CoreCatalogue />,
};

function FormsCatalogue() {
  const [count, setCount] = useState(1);
  const [enabled, setEnabled] = useState(true);
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 720 }}>
      <Field id="name" label="Guest name" required>
        <Input icon="users" placeholder="Full name" />
      </Field>
      <Field
        hint="Western digits remain LTR"
        id="phone"
        label="WhatsApp number"
      >
        <PhoneInput placeholder="5X XXX XXXX" />
      </Field>
      <Field id="type" label="Invitation type">
        <Select
          options={[
            { label: "Single person", value: "single" },
            { label: "Named group", value: "group" },
            { label: "Person with companions", value: "companions" },
          ]}
          placeholder="Choose a type"
        />
      </Field>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <Checkbox defaultChecked label="Named guest" />
        <Radio defaultChecked label="Accept" name="answer" value="accept" />
        <Radio label="Decline" name="answer" value="decline" />
      </div>
      <Switch
        checked={enabled}
        description="Guests can revise a submitted response"
        label="Allow RSVP edits"
        onChange={(event) => setEnabled(event.currentTarget.checked)}
      />
      <Stepper
        decrementLabel="Remove companion"
        groupLabel="Companion count"
        incrementLabel="Add companion"
        max={3}
        onChange={setCount}
        value={count}
      />
      <div
        aria-label="Invitation type"
        role="radiogroup"
        style={{ display: "grid", gap: 10 }}
      >
        <ChoiceCard
          icon="users"
          selected
          title="Named family"
          description="Choose each attending member"
        />
        <ChoiceCard
          icon="user-plus"
          title="Person with companions"
          description="One primary guest and a companion allowance"
        />
      </div>
    </div>
  );
}

export const Forms: Story = {
  render: () => <FormsCatalogue />,
};

const rows = [
  { id: "1", name: "Noura Al-Qahtani", phone: "+966501234567", expected: 4 },
  { id: "2", name: "Khalid Al-Omari", phone: "+966551112222", expected: 2 },
];

export const DataDisplay: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
        }}
      >
        <StatCard
          context="people expected"
          label="Expected attendance"
          locale="en"
          value={497}
        />
        <StatCard
          context="invitation groups"
          label="Accepted"
          locale="en"
          tone="accepted"
          value={89}
        />
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Num locale="ar-SA" value={620} />
        <Phone value="+966501234567" />
        <Phone masked value="+966501234567" />
        <StatusPill kind="rsvp" label="Accepted" status="accepted" />
        <StatusPill kind="delivery" label="Delivered" status="delivered" />
      </div>
      <ProgressBar
        ariaLabel="RSVP distribution"
        locale="en"
        segments={[
          { label: "Accepted", tone: "accepted", value: 89 },
          { label: "Pending", tone: "pending", value: 24 },
          { label: "Declined", tone: "declined", value: 7 },
        ]}
      />
      <Funnel
        ariaLabel="WhatsApp delivery funnel"
        locale="en"
        steps={[
          { label: "Sent", value: 400 },
          { label: "Delivered", value: 386 },
          { label: "Read", value: 331 },
          { label: "Responded", value: 264 },
        ]}
      />
      <Timeline
        items={[
          {
            id: "sent",
            icon: "send",
            label: "Invitation sent",
            time: "18:02",
            tone: "notsent",
          },
          {
            id: "read",
            icon: "eye",
            label: "Message read",
            time: "18:07",
            tone: "checkedin",
          },
          {
            id: "reply",
            hollow: true,
            label: "Awaiting response",
            tone: "pending",
          },
        ]}
      />
      <Table
        columns={[
          {
            header: "Invitation group",
            key: "name",
            render: (row) => row.name,
          },
          {
            header: "WhatsApp",
            key: "phone",
            render: (row) => <Phone value={row.phone} />,
          },
          {
            align: "end",
            header: "Expected people",
            key: "expected",
            render: (row) => <Num locale="en" value={row.expected} />,
          },
        ]}
        getRowKey={(row) => row.id}
        renderMobile={(row) => (
          <>
            <strong>{row.name}</strong>
            <br />
            <Phone value={row.phone} />
          </>
        )}
        rows={rows}
      />
    </div>
  ),
};

export const Feedback: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16 }}>
      <Banner
        actionLabel="Review messages"
        kind="danger"
        title="3 messages failed"
        description="Review the provider response before retrying."
      />
      <Banner
        actionLabel="Open event"
        kind="info"
        title="RSVP closes tomorrow"
        compact
      />
      <Toast
        dismissLabel="Dismiss"
        kind="success"
        onDismiss={() => undefined}
        title="29 invitations sent"
      />
      <EmptyState
        action={<Button variant="secondary">Create event</Button>}
        description="Create the first event to start managing invitation groups."
        icon="calendar"
        title="No events yet"
      />
      <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <Skeleton height={22} width="45%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="72%" />
      </div>
    </div>
  ),
};
