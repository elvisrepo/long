import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { PageState } from "../../components/page-state";
import { Modal } from "../../components/modal";
import { useMeQuery } from "../auth/use-me-query";
import {
  getDietCatalog,
  getDietEntries,
  saveDietItem,
  setDietCheckoff,
  type DietSection,
} from "./diet-api";
import { dayLabel, localDay, shiftDay } from "./diet-dates";
import "./diet.css";
type Editor = {
  kind: "sections" | "foods";
  id?: string;
  section_id?: string;
  name: string;
  display_order?: number;
};
export function DietScreen() {
  const owner = useMeQuery().data?.email;
  const client = useQueryClient();
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const [managing, setManaging] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  const catalog = useQuery({
    queryKey: ["diet", owner, "catalog"],
    queryFn: getDietCatalog,
    enabled: !!owner,
  });
  const entries = useQuery({
    queryKey: ["diet", owner, "entries", day],
    queryFn: () => getDietEntries(day, day),
    placeholderData: keepPreviousData,
    enabled: !!owner,
  });
  const history = useQuery({
    queryKey: ["diet", owner, "entries", "history", today],
    queryFn: () => getDietEntries(days[0], today),
    enabled: !!owner,
  });
  const checkoff = useMutation({
    mutationFn: ({
      id,
      date,
      checked,
    }: {
      id: string;
      date: string;
      checked: boolean;
    }) => setDietCheckoff(id, date, checked),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["diet", owner, "entries"] }),
  });
  const manage = useMutation({
    mutationFn: ({
      kind,
      id,
      data,
    }: {
      kind: "sections" | "foods";
      id?: string;
      data: Parameters<typeof saveDietItem>[2];
    }) => saveDietItem(kind, id, data),
    onSuccess: async () => {
      setEditor(null);
      await client.invalidateQueries({ queryKey: ["diet", owner, "catalog"] });
    },
  });
  function selectDay(date: string) {
    if (date) {
      setDay(date);
      checkoff.reset();
    }
  }
  function edit(value: Editor) {
    manage.reset();
    setEditor(value);
  }
  if (catalog.isPending || entries.isPending || history.isPending)
    return <PageState message="Loading diet checklist…" />;
  if (catalog.isError || entries.isError || history.isError)
    return <PageState message="Diet failed to load. Please try again." error />;
  const { sections, foods } = catalog.data;
  const activeSections = sections.filter((s) => s.is_active);
  const checked = new Set(
    entries.data.filter((e) => e.performed_on === day).map((e) => e.food_id),
  );
  const selectedEntries = entries.data.filter((e) => e.performed_on === day);
  const covered = new Set(
    selectedEntries
      .map((e) => foods.find((f) => f.id === e.food_id)?.section_id)
      .filter(Boolean),
  ).size;
  const busy = checkoff.isPending || entries.isFetching || manage.isPending;
  function archive(kind: "sections" | "foods", item: DietSection) {
    manage.reset();
    manage.mutate({ kind, id: item.id, data: { is_active: !item.is_active } });
  }
  return (
    <div className="diet-screen">
      <header className="diet-heading">
        <h1>Diet</h1>
        <p>Record the foods you ate.</p>
      </header>
      <section className="diet-card diet-context" aria-label="Daily tracking">
        <div className="diet-day-header">
          <div>
            <h2>
              {day === today
                ? `Today, ${new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
                : dayLabel(day)}
            </h2>
            <p role="status">
              {entries.isFetching
                ? "Loading foods…"
                : `${selectedEntries.length} ${selectedEntries.length === 1 ? "food" : "foods"} recorded · ${covered} ${covered === 1 ? "section" : "sections"} represented`}
            </p>
            <div className="diet-status" role="status">
              {checkoff.isPending || (checkoff.isSuccess && entries.isFetching)
                ? "Saving…"
                : checkoff.isSuccess
                  ? "Saved"
                  : ""}
            </div>
          </div>
          <div className="diet-date-controls">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => selectDay(shiftDay(day, -1))}
            >
              ←
            </button>
            <label>
              <span className="visually-hidden">Tracking date</span>
              <input
                type="date"
                value={day}
                onChange={(e) => selectDay(e.target.value)}
              />
            </label>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => selectDay(shiftDay(day, 1))}
            >
              →
            </button>
            <button type="button" onClick={() => selectDay(today)}>
              Today
            </button>
          </div>
        </div>
        <div role="group" aria-label="Last 7 days">
          <div className="diet-week">
            {days.map((date) => (
              <button
                type="button"
                key={date}
                aria-label={dayLabel(date)}
                aria-pressed={day === date}
                aria-current={date === today ? "date" : undefined}
                onClick={() => selectDay(date)}
              >
                <span>
                  {new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
                    weekday: "short",
                  })}
                </span>
                <strong>{Number(date.slice(-2))}</strong>
                <small>
                  {history.data.filter((e) => e.performed_on === date).length}{" "}
                  logged
                </small>
              </button>
            ))}
          </div>
          <p className="diet-week-caption">
            Last 7 days ·{" "}
            {new Set(history.data.map((entry) => entry.performed_on)).size} days
            with records · includes archived foods
          </p>
        </div>
        {!entries.isFetching && selectedEntries.length > 0 && (
          <details className="diet-recorded">
            <summary>Recorded foods ({selectedEntries.length})</summary>
            <ul>
              {selectedEntries.map((entry) => (
                <li key={entry.id}>
                  <span>
                    {foods.find((f) => f.id === entry.food_id)?.name ??
                      "Archived food"}
                    <small>
                      {sections.find(
                        (section) =>
                          section.id ===
                          foods.find((food) => food.id === entry.food_id)
                            ?.section_id,
                      )?.name ?? "Archived section"}
                    </small>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      checkoff.mutate({
                        id: entry.food_id,
                        date: day,
                        checked: false,
                      })
                    }
                    aria-label={`Remove ${foods.find((f) => f.id === entry.food_id)?.name ?? "food"} check-off`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {checkoff.isError && <p role="alert">{checkoff.error.message}</p>}
      {manage.isError && !editor && <p role="alert">{manage.error.message}</p>}
      <section className="diet-catalog" aria-label="Your food checklist">
        <div className="diet-catalog-toolbar">
          <div>
            <h2>Your food checklist</h2>
            <p>
              {activeSections.length} sections ·{" "}
              {
                foods.filter(
                  (food) =>
                    food.is_active &&
                    activeSections.some(
                      (section) => section.id === food.section_id,
                    ),
                ).length
              }{" "}
              foods · your own categories
            </p>
          </div>
          <div className="diet-actions">
            <button
              type="button"
              aria-pressed={managing}
              onClick={() => {
                setManaging(!managing);
                manage.reset();
              }}
            >
              {managing ? "Done managing" : "Manage checklist"}
            </button>
            <button
              type="button"
              className="diet-add"
              aria-label="Add section"
              onClick={() => edit({ kind: "sections", name: "" })}
            >
              + Section
            </button>
          </div>
        </div>
        {managing && (
          <p className="diet-manage-note">
            Use ••• to edit names, display order or archive. Archiving keeps
            past check-offs. Restore a section before restoring or tracking its
            foods. Smaller order numbers appear first.
          </p>
        )}
        {!activeSections.length && (
          <section className="diet-card">
            <h2>Build your food checklist</h2>
            <p>
              Create a section such as Protein, then add foods you want to
              track. Nothing is preselected, and you can name your sections
              however you like.
            </p>
          </section>
        )}
        <div className="diet-sections">
          {(managing ? sections : activeSections).map((section) => {
            const sectionFoods = foods.filter(
              (food) =>
                food.section_id === section.id && (managing || food.is_active),
            );
            return (
              <section
                className="diet-card diet-section"
                key={section.id}
                aria-label={section.name}
              >
                <div className="diet-card-heading">
                  <div className="diet-section-title">
                    <span className="diet-section-icon" aria-hidden="true">
                      {section.name.slice(0, 1)}
                    </span>
                    <div>
                      <h2>
                        {section.name}
                        {!section.is_active && <small> · Archived</small>}
                      </h2>
                      <p>
                        {sectionFoods.length} foods ·{" "}
                        {
                          foods.filter(
                            (food) =>
                              food.section_id === section.id &&
                              checked.has(food.id),
                          ).length
                        }{" "}
                        recorded
                      </p>
                    </div>
                  </div>
                  <div className="diet-actions">
                    {section.is_active && (
                      <button
                        type="button"
                        className="diet-add"
                        aria-label={`Add food to ${section.name}`}
                        onClick={() =>
                          edit({
                            kind: "foods",
                            section_id: section.id,
                            name: "",
                          })
                        }
                      >
                        + Food
                      </button>
                    )}
                    {managing && (
                      <DietItemActions
                        item={section}
                        busy={manage.isPending}
                        onEdit={() => edit({ kind: "sections", ...section })}
                        onToggle={() => archive("sections", section)}
                      />
                    )}
                  </div>
                </div>
                <div className="diet-food-list">
                  {sectionFoods.map((food) => (
                    <div
                      className={`diet-food${checked.has(food.id) ? " diet-food-checked" : ""}`}
                      key={food.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={checked.has(food.id)}
                          disabled={
                            busy ||
                            managing ||
                            !food.is_active ||
                            !section.is_active
                          }
                          onChange={(event) =>
                            checkoff.mutate({
                              id: food.id,
                              date: day,
                              checked: event.target.checked,
                            })
                          }
                        />
                        <span>
                          {food.name}
                          {!food.is_active && <small> · Archived</small>}
                        </span>
                      </label>
                      {managing && (
                        <DietItemActions
                          item={food}
                          busy={manage.isPending}
                          restoreBlocked={!section.is_active && !food.is_active}
                          onEdit={() => edit({ kind: "foods", ...food })}
                          onToggle={() => archive("foods", food)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {sectionFoods.length === 0 && (
                  <p className="diet-section-empty">
                    No foods yet. Add foods you eat to start tracking.
                  </p>
                )}
              </section>
            );
          })}
        </div>
        <p className="diet-tracking-note">
          Record what applies. You do not need to check every food. Portions and
          nutrient amounts are not tracked.
        </p>
      </section>
      {editor && (
        <Modal
          labelledBy="diet-editor-title"
          onClose={() => setEditor(null)}
          busy={manage.isPending}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const { kind, id, name, section_id, display_order } = editor;
              manage.mutate({
                kind,
                id,
                data: {
                  name: name.trim(),
                  ...(section_id && !id ? { section_id } : {}),
                  ...(id ? { display_order } : {}),
                },
              });
            }}
          >
            <h2 id="diet-editor-title">
              {editor.id ? "Edit" : "Add"}{" "}
              {editor.kind === "sections" ? "section" : "food"}
            </h2>
            <label>
              {editor.kind === "sections" ? "Section name" : "Food name"}
              <input
                required
                maxLength={120}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            {editor.id && (
              <label>
                Display order
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  required
                  value={editor.display_order}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      display_order: Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
            {manage.isError && <p role="alert">{manage.error.message}</p>}
            <div className="diet-actions">
              <button
                type="submit"
                disabled={manage.isPending || !editor.name.trim()}
              >
                {manage.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={manage.isPending}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function DietItemActions({
  item,
  busy,
  restoreBlocked = false,
  onEdit,
  onToggle,
}: {
  item: DietSection;
  busy: boolean;
  restoreBlocked?: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  function closeMenu(button: HTMLButtonElement) {
    const details = button.closest("details");
    details?.querySelector("summary")?.focus();
    details?.removeAttribute("open");
  }
  return (
    <details className="diet-item-actions">
      <summary tabIndex={0} aria-label={`Actions for ${item.name}`}>
        •••
      </summary>
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            closeMenu(event.currentTarget);
            onEdit();
          }}
        >
          Edit {item.name}
        </button>
        <button
          type="button"
          disabled={busy || restoreBlocked}
          onClick={(event) => {
            closeMenu(event.currentTarget);
            onToggle();
          }}
        >
          {item.is_active ? "Archive" : "Restore"} {item.name}
        </button>
      </div>
    </details>
  );
}
