import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../components/page-header";
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
      <PageHeader
        title="Diet"
        eyebrow="YOUR FOOD CHECKLIST"
        description="Track foods you ate. No portions, calories or nutrition totals—just your own daily checklist."
      />
      <div className="diet-toolbar">
        <div className="diet-date-controls date-navigation">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => selectDay(shiftDay(day, -1))}
          >
            ←
          </button>
          <label>
            Tracking date
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
      </div>
      <div className="diet-status" role="status">
        {checkoff.isPending ? "Saving…" : checkoff.isSuccess ? "Saved" : ""}
      </div>
      {checkoff.isError && <p role="alert">{checkoff.error.message}</p>}
      {manage.isError && !editor && <p role="alert">{manage.error.message}</p>}
      <div className="diet-layout">
        <div className="diet-sections">
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
          {(managing ? sections : activeSections).map((section) => (
            <section
              className="diet-card"
              key={section.id}
              aria-label={section.name}
            >
              <div className="diet-card-heading">
                <h2>
                  {section.name}
                  {!section.is_active && <small> · Archived</small>}
                </h2>
                {managing && (
                  <div className="diet-actions">
                    <button
                      type="button"
                      onClick={() => edit({ kind: "sections", ...section })}
                    >
                      Edit {section.name}
                    </button>
                    <button
                      type="button"
                      disabled={manage.isPending}
                      onClick={() => archive("sections", section)}
                    >
                      {section.is_active ? "Archive" : "Restore"} {section.name}
                    </button>
                  </div>
                )}
              </div>
              <div className="diet-food-grid">
                {foods
                  .filter(
                    (f) =>
                      f.section_id === section.id && (managing || f.is_active),
                  )
                  .map((food) => (
                    <div className="diet-food" key={food.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked.has(food.id)}
                          disabled={
                            busy || !food.is_active || !section.is_active
                          }
                          onChange={(e) =>
                            checkoff.mutate({
                              id: food.id,
                              date: day,
                              checked: e.target.checked,
                            })
                          }
                        />{" "}
                        <span>
                          {food.name}
                          {!food.is_active && <small> · Archived</small>}
                        </span>
                      </label>
                      {managing && (
                        <div className="diet-actions">
                          <button
                            type="button"
                            onClick={() => edit({ kind: "foods", ...food })}
                          >
                            Edit {food.name}
                          </button>
                          <button
                            type="button"
                            disabled={
                              manage.isPending ||
                              (!section.is_active && !food.is_active)
                            }
                            onClick={() => archive("foods", food)}
                          >
                            {food.is_active ? "Archive" : "Restore"} {food.name}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              {!foods.some(
                (f) => f.section_id === section.id && f.is_active,
              ) && <p>No foods yet. Add foods you eat to start tracking.</p>}
              {section.is_active && (
                <button
                  type="button"
                  className="diet-add"
                  onClick={() =>
                    edit({ kind: "foods", section_id: section.id, name: "" })
                  }
                >
                  Add food to {section.name}
                </button>
              )}
            </section>
          ))}
          <button
            type="button"
            className="diet-add"
            onClick={() => edit({ kind: "sections", name: "" })}
          >
            Add section
          </button>
          {managing && (
            <p>
              Archiving keeps past check-offs. Restore a section before
              restoring or tracking its foods. Order numbers set the display
              order (smaller numbers first).
            </p>
          )}
        </div>
        <aside className="diet-summary">
          <section className="diet-card">
            <h2>{day === today ? "Today" : dayLabel(day)}</h2>
            <p>
              {selectedEntries.length}{" "}
              {selectedEntries.length === 1 ? "food" : "foods"} recorded ·{" "}
              {covered} {covered === 1 ? "section" : "sections"} represented
            </p>
            <p>
              This is a record of foods eaten, not a diet quality score. You do
              not need to check every food.
            </p>
            {selectedEntries.length > 0 && (
              <details>
                <summary>Recorded foods</summary>
                <ul>
                  {selectedEntries.map((entry) => (
                    <li key={entry.id}>
                      {foods.find((f) => f.id === entry.food_id)?.name ??
                        "Archived food"}
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
          <section className="diet-card">
            <h2>Last 7 days</h2>
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
                  <span>{Number(date.slice(-2))}</span>
                  <strong>
                    {history.data.filter((e) => e.performed_on === date).length}
                  </strong>
                </button>
              ))}
            </div>
            <p>
              Foods recorded, including archived foods. Zero means none
              recorded.
            </p>
          </section>
        </aside>
      </div>
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
                autoFocus
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
