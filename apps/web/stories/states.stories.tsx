import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Banner,
  Button,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Skeleton,
} from "../../../packages/ui/src";

const meta = {
  title: "Foundations/States",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingEmptyError: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gap: 28,
        gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
      }}
    >
      <section aria-label="Loading state" style={{ display: "grid", gap: 10 }}>
        <Skeleton height={24} width="45%" />
        <Skeleton height={120} />
        <Skeleton height={14} width="70%" />
      </section>
      <EmptyState
        action={<Button variant="secondary">Create event</Button>}
        description="Create the first event to begin."
        icon="calendar"
        title="No events yet"
      />
      <Banner
        actionLabel="Try again"
        kind="danger"
        title="Events could not be loaded"
        description="Check the API connection."
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <Button disabled>Unavailable action</Button>
      <Button loading>Saving event</Button>
      <Field id="disabled" label="Venue">
        <Input disabled value="Venue" />
      </Field>
    </div>
  ),
};

export const Focus: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>("button")?.focus();
  },
  render: () => <Button>Keyboard focus target</Button>,
};

export const DestructiveDialog: Story = {
  render: () => (
    <Dialog
      closeLabel="Close"
      description="This action removes the invitation group and cannot be undone."
      footer={
        <>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Remove group</Button>
        </>
      }
      onClose={() => undefined}
      open
      title="Remove invitation group?"
    >
      <p style={{ margin: 0 }}>The group contains 4 named guests.</p>
    </Dialog>
  ),
};

export const DetailsDrawer: Story = {
  render: () => (
    <Drawer
      closeLabel="Close"
      description="One WhatsApp number · 4 named guests"
      footer={<Button>Save changes</Button>}
      onClose={() => undefined}
      open
      title="Al-Qahtani family"
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Field id="drawer-name" label="Group name">
          <Input value="Al-Qahtani family" readOnly />
        </Field>
        <Banner kind="info" title="Response pending" />
      </div>
    </Drawer>
  ),
};
