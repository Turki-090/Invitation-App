"use client";

import type { CSSProperties, ReactNode } from "react";
import { Checkbox } from "./checkbox";
import { IconButton } from "./icon-button";

type RowKey = string | number;

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  width?: CSSProperties["width"];
  align?: "start" | "center" | "end";
  wrap?: boolean;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => RowKey;
  selectable?: boolean;
  selected?: readonly RowKey[];
  onSelect?: (selected: RowKey[]) => void;
  onRowClick?: (row: Row) => void;
  rowLabel?: (row: Row) => string;
  rowActionHeaderLabel?: string;
  renderMobile?: (row: Row) => ReactNode;
  dense?: boolean;
  emptyState?: ReactNode;
  selectAllLabel?: string;
  selectRowLabel?: (row: Row) => string;
  className?: string;
  style?: CSSProperties;
}

export function Table<Row>({
  columns,
  rows,
  getRowKey,
  selectable = false,
  selected = [],
  onSelect,
  onRowClick,
  rowLabel,
  rowActionHeaderLabel,
  renderMobile,
  dense = false,
  emptyState,
  selectAllLabel,
  selectRowLabel,
  className,
  style,
}: TableProps<Row>) {
  const keys = rows.map(getRowKey);
  const allSelected =
    keys.length > 0 && keys.every((key) => selected.includes(key));
  const someSelected =
    !allSelected && keys.some((key) => selected.includes(key));

  if (selectable && (!onSelect || !selectAllLabel || !selectRowLabel)) {
    throw new Error(
      "Selectable Table requires onSelect, selectAllLabel, and selectRowLabel.",
    );
  }

  const toggleAll = () => onSelect?.(allSelected ? [] : keys);
  const toggle = (key: RowKey) =>
    onSelect?.(
      selected.includes(key)
        ? selected.filter((selectedKey) => selectedKey !== key)
        : [...selected, key],
    );
  if (onRowClick && (!rowLabel || !rowActionHeaderLabel)) {
    throw new Error(
      "Interactive Table rows require rowLabel and rowActionHeaderLabel.",
    );
  }

  return (
    <div
      className={[
        "dawah-table-wrap",
        dense ? "dawah-table-wrap--dense" : "",
        renderMobile ? "dawah-table-wrap--responsive" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div className="dawah-table-scroll">
        <table>
          <thead>
            <tr>
              {selectable ? (
                <th className="dawah-table__select">
                  <Checkbox
                    ariaLabel={selectAllLabel}
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  className={`dawah-table__align--${column.align ?? "start"}`}
                  key={column.key}
                  style={{ width: column.width }}
                >
                  {column.header}
                </th>
              ))}
              {onRowClick ? (
                <th className="dawah-table__action" scope="col">
                  <span className="dawah-sr-only">{rowActionHeaderLabel}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {!rows.length && emptyState ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (onRowClick ? 1 : 0)
                  }
                >
                  {emptyState}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const key = getRowKey(row);
              const isSelected = selected.includes(key);
              return (
                <tr
                  aria-label={rowLabel?.(row)}
                  aria-selected={selectable ? isSelected : undefined}
                  data-selected={isSelected ? "true" : undefined}
                  key={key}
                >
                  {selectable ? (
                    <td className="dawah-table__select">
                      <Checkbox
                        ariaLabel={selectRowLabel?.(row)}
                        checked={isSelected}
                        onChange={() => toggle(key)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      className={[
                        `dawah-table__align--${column.align ?? "start"}`,
                        column.wrap ? "dawah-table__wrap" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={column.key}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                  {onRowClick ? (
                    <td className="dawah-table__action">
                      <IconButton
                        flipRtl
                        label={rowLabel?.(row) ?? ""}
                        name="arrow-left"
                        onClick={() => onRowClick(row)}
                        size="sm"
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {renderMobile ? (
        <div className="dawah-table-cards">
          {!rows.length ? emptyState : null}
          {rows.map((row) => {
            const key = getRowKey(row);
            return (
              <article
                aria-label={rowLabel?.(row)}
                data-selected={selected.includes(key) ? "true" : undefined}
                key={key}
              >
                {selectable ? (
                  <div>
                    <Checkbox
                      ariaLabel={selectRowLabel?.(row)}
                      checked={selected.includes(key)}
                      onChange={() => toggle(key)}
                    />
                  </div>
                ) : null}
                <div className="dawah-table-card__content">
                  {renderMobile(row)}
                </div>
                {onRowClick ? (
                  <IconButton
                    className="dawah-table-card__action"
                    flipRtl
                    label={rowLabel?.(row) ?? ""}
                    name="arrow-left"
                    onClick={() => onRowClick(row)}
                    size="sm"
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
