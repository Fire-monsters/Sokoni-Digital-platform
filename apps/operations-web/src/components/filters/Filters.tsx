import type { ReactNode } from "react";
export function FilterBar({
  children,
  onClear,
  active = false,
}: {
  children: ReactNode;
  onClear?: () => void;
  active?: boolean;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-fields">{children}</div>
      {onClear && active ? (
        <button className="text-button" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
export function SearchFilter({
  label = "Search",
  value,
  onChange,
  placeholder = "Search…",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="filter-field search-filter">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export type SelectOption = { label: string; value: string };
export function SelectFilter({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  allLabel?: string;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export type DateRange = { from: string; to: string };
export function DateRangeFilter({
  label = "Date range",
  value,
  onChange,
}: {
  label?: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  return (
    <fieldset className="filter-field date-range">
      <legend>{label}</legend>
      <label>
        <span>From</span>
        <input
          aria-label={`${label} from`}
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => onChange({ ...value, from: event.target.value })}
        />
      </label>
      <label>
        <span>To</span>
        <input
          aria-label={`${label} to`}
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => onChange({ ...value, to: event.target.value })}
        />
      </label>
    </fieldset>
  );
}
