import "./setup";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Banner,
  Button,
  Checkbox,
  ChoiceCard,
  Drawer,
  Field,
  Funnel,
  HostShell,
  Input,
  ProgressBar,
  Radio,
  Select,
  Stepper,
  Switch,
  Table,
  Tabs,
  Toast,
  Tooltip,
} from "../src";

function InteractiveControls() {
  const [tab, setTab] = useState("all");
  const [count, setCount] = useState(1);
  const [selected, setSelected] = useState(false);
  return (
    <div dir="ltr">
      <Tabs
        ariaLabel="Invitation filters"
        items={[
          { id: "all", label: "All", count: 4 },
          { id: "pending", label: "Pending", count: 2 },
          { id: "declined", label: "Declined", count: 1 },
        ]}
        onChange={setTab}
        value={tab}
      />
      <Stepper
        decrementLabel="Remove companion"
        groupLabel="Companions"
        incrementLabel="Add companion"
        max={2}
        onChange={setCount}
        value={count}
      />
      <Checkbox
        checked={selected}
        label="Noura"
        onChange={(event) => setSelected(event.currentTarget.checked)}
      />
    </div>
  );
}

function InteractiveChoices() {
  const [value, setValue] = useState("single");
  return (
    <div aria-label="Invitation type" role="radiogroup">
      <ChoiceCard
        onClick={() => setValue("single")}
        selected={value === "single"}
        title="Single person"
      />
      <ChoiceCard
        onClick={() => setValue("group")}
        selected={value === "group"}
        title="Named group"
      />
    </div>
  );
}

describe("design-system interactions", () => {
  it("supports roving keyboard focus in tabs", async () => {
    const user = userEvent.setup();
    render(<InteractiveControls />);
    const all = screen.getByRole("tab", { name: /All/ });
    all.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen
        .getByRole("tab", { name: /Pending/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.keyboard("{End}");
    expect(
      screen
        .getByRole("tab", { name: /Declined/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("keeps the guest stepper inside its declared bounds", async () => {
    const user = userEvent.setup();
    render(<InteractiveControls />);
    const increment = screen.getByRole("button", { name: "Add companion" });
    await user.click(increment);
    expect(increment).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Remove companion" }));
    expect(screen.getByRole("status").textContent).toBe("1");
  });

  it("exposes native selection semantics", async () => {
    const user = userEvent.setup();
    render(<InteractiveControls />);
    const checkbox = screen.getByRole("checkbox", { name: "Noura" });
    await user.click(checkbox);
    expect(checkbox).toHaveProperty("checked", true);
  });

  it("supports roving keyboard selection in choice-card radio groups", async () => {
    const user = userEvent.setup();
    render(<InteractiveChoices />);
    const single = screen.getByRole("radio", { name: "Single person" });
    const group = screen.getByRole("radio", { name: "Named group" });
    expect(single.tabIndex).toBe(0);
    expect(group.tabIndex).toBe(-1);
    single.focus();
    await user.keyboard("{ArrowRight}");
    expect(group.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(group);
    expect(single.tabIndex).toBe(-1);
    expect(group.tabIndex).toBe(0);
  });

  it("renders the visual state of an uncontrolled checked checkbox", () => {
    const { container } = render(<Checkbox defaultChecked label="Noura" />);
    const checkbox = screen.getByRole("checkbox", { name: "Noura" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector(".dawah-check__box svg")).not.toBeNull();
  });

  it("dismisses a keyboard-opened tooltip with Escape", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="Open details">
        <Button>Details</Button>
      </Tooltip>,
    );
    await user.tab();
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.getAttribute("data-open")).toBe("true");
    await user.keyboard("{Escape}");
    expect(tooltip.getAttribute("data-open")).toBe("false");
  });

  it("keeps collapsed navigation named and exposes compact utility", async () => {
    const user = userEvent.setup();
    render(
      <HostShell
        brand={<span>Dawah</span>}
        collapseLabel="Collapse navigation"
        compactUtility={<Button>Sign out</Button>}
        expandLabel="Expand navigation"
        items={[
          {
            active: true,
            href: "#overview",
            icon: "layout-dashboard",
            id: "overview",
            label: "Overview",
          },
        ]}
        navigationLabel="Primary navigation"
      >
        <p>Workspace</p>
      </HostShell>,
    );
    await user.click(
      screen.getByRole("button", { name: "Collapse navigation" }),
    );
    expect(screen.getAllByRole("link", { name: "Overview" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("propagates required and invalid field semantics to the native control", () => {
    render(
      <Field error="Required" id="name" label="Name" required>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/Name/);
    expect((input as HTMLInputElement).required).toBe(true);
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      input.parentElement?.classList.contains("dawah-input--invalid"),
    ).toBe(true);
  });

  it("activates responsive table cards with pointer and keyboard", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const { container } = render(
      <Table
        columns={[
          {
            header: "Name",
            key: "name",
            render: (row) => <button type="button">Inspect {row.name}</button>,
          },
        ]}
        getRowKey={(row) => row.id}
        onRowClick={onRowClick}
        onSelect={() => undefined}
        renderMobile={(row) => (
          <button type="button">Details for {row.name}</button>
        )}
        rowActionHeaderLabel="Actions"
        rowLabel={(row) => `Open ${row.name}`}
        rows={[{ id: "1", name: "Noura" }]}
        selectAllLabel="Select all"
        selectRowLabel={(row) => `Select ${row.name}`}
        selectable
        selected={["1"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Inspect Noura" }));
    expect(onRowClick).not.toHaveBeenCalled();
    const card = container.querySelector(".dawah-table-cards article");
    expect(card?.getAttribute("aria-selected")).toBeNull();
    expect(card?.getAttribute("data-selected")).toBe("true");
    expect(
      container
        .querySelector<HTMLButtonElement>(".dawah-table-card__content button")
        ?.closest(".dawah-table-card__action"),
    ).toBeNull();
    const action = container.querySelector<HTMLButtonElement>(
      ".dawah-table-card__action",
    );
    expect(action).not.toBeNull();
    await user.click(action!);
    action!.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("keeps funnel step data in the accessibility tree", () => {
    render(
      <Funnel
        ariaLabel="Delivery funnel"
        locale="en"
        steps={[
          { label: "Sent", value: 100 },
          { label: "Read", value: 75 },
        ]}
      />,
    );
    const funnel = screen.getByRole("list", { name: "Delivery funnel" });
    expect(funnel.textContent).toContain("Sent");
    expect(funnel.textContent).toContain("100");
    expect(funnel.textContent).toContain("Read");
    expect(funnel.textContent).toContain("75%");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("opens a modal drawer and requests close on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Drawer closeLabel="Close" onClose={onClose} open title="Guest details">
        <Button>Save</Button>
      </Drawer>,
    );
    const drawer = screen.getByRole("dialog");
    expect(drawer.hasAttribute("open")).toBe(true);
    drawer.dispatchEvent(
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("design-system accessibility", () => {
  it("has no detectable axe violations across critical controls", async () => {
    const rows = [{ id: "1", name: "Noura", phone: "+966501234567" }];
    const { container } = render(
      <main>
        <Field
          hint="International format"
          id="phone"
          label="Mobile number"
          required
        >
          <Input icon="phone" />
        </Field>
        <Select
          aria-label="Invitation type"
          defaultValue="single"
          options={[{ label: "Single person", value: "single" }]}
        />
        <Checkbox label="Named guest" />
        <Radio label="Accept" name="answer" value="yes" />
        <Switch label="Allow edits" />
        <div aria-label="Invitation type" role="radiogroup">
          <ChoiceCard selected title="Single person" />
        </div>
        <ProgressBar
          ariaLabel="RSVP progress"
          locale="en"
          segments={[
            { label: "Accepted", tone: "accepted", value: 8 },
            { label: "Pending", tone: "pending", value: 2 },
          ]}
        />
        <Table
          columns={[{ header: "Name", key: "name", render: (row) => row.name }]}
          getRowKey={(row) => row.id}
          rows={rows}
          selectAllLabel="Select all"
          selectRowLabel={(row) => `Select ${row.name}`}
          selectable
          selected={[]}
          onSelect={() => undefined}
        />
        <Banner
          actionLabel="Review"
          kind="warning"
          title="Two messages need attention"
        />
        <Toast kind="success" title="Two invitations sent" />
      </main>,
    );
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
