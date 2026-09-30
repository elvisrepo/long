import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "../../components/page-header";
import { Modal } from "../../components/modal";
import { PageState } from "../../components/page-state";
import { useMeQuery } from "../auth/use-me-query";
import {
  createRecoveryTool,
  getRecoveryEntries,
  getRecoveryTools,
  setRecoveryCheckoff,
  updateRecoveryTool,
} from "./recovery-api";
import "./recovery.css";

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDay(date);
}

export function RecoveryScreen() {
  const queryClient = useQueryClient();
  const owner = useMeQuery().data?.email;
  const [day, setDay] = useState(() => localDay(new Date()));
  const [toolName, setToolName] = useState("");
  const [addingTool, setAddingTool] = useState(false);
  function selectDay(date: string) {
    setDay(date);
    checkoff.reset();
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() - 6 + index);
    return localDay(date);
  });
  const catalog = useQuery({
    queryKey: ["recovery", owner, "tools"],
    queryFn: getRecoveryTools,
    enabled: !!owner,
  });
  const entries = useQuery({
    queryKey: ["recovery", owner, "entries", day],
    queryFn: () => getRecoveryEntries(days[0], day),
    placeholderData: keepPreviousData,
    enabled: !!owner,
  });
  const checkoff = useMutation({
    mutationFn: ({
      toolId,
      date,
      checked,
    }: {
      toolId: string;
      date: string;
      checked: boolean;
    }) => setRecoveryCheckoff(toolId, date, checked),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["recovery", owner, "entries"],
      }),
  });
  const createTool = useMutation({
    mutationFn: (name: string) => createRecoveryTool(name),
    onSuccess: async () => {
      setToolName("");
      setAddingTool(false);
      await queryClient.invalidateQueries({
        queryKey: ["recovery", owner, "tools"],
      });
    },
  });
  const archiveTool = useMutation({
    mutationFn: ({ toolId, active }: { toolId: string; active: boolean }) =>
      updateRecoveryTool(toolId, active),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["recovery", owner, "tools"] }),
  });
  if (catalog.isPending || entries.isPending)
    return <PageState message="Loading recovery tools…" />;
  if (catalog.isError || entries.isError)
    return (
      <PageState message="Recovery failed to load. Please try again." error />
    );
  const activeTools = catalog.data.tools.filter((tool) => tool.is_active);
  const checkedTools = new Set(
    entries.data
      .filter((entry) => entry.performed_on === day)
      .map((entry) => entry.tool_id),
  );
  const checkedCount = activeTools.filter((tool) =>
    checkedTools.has(tool.id),
  ).length;
  return (
    <section className="recovery-screen">
      <PageHeader
        title="Recovery"
        eyebrow="Recover thoughtfully"
        description="Track what you did. Research bars describe estimated muscle soreness relief, not overall recovery."
        actions={
          catalog.data.can_create_custom && (
            <button
              aria-label="Add custom tool"
              className="recovery-action recovery-add"
              onClick={() => {
                createTool.reset();
                setAddingTool(true);
              }}
            >
              + Add custom tool
            </button>
          )
        }
      />
      <div className="recovery-date-navigation">
        <button
          className="recovery-action"
          aria-label="Previous day"
          onClick={() => selectDay(shiftDay(day, -1))}
        >
          ←
        </button>
        <label className="recovery-date">
          Tracking date{" "}
          <input
            type="date"
            value={day}
            onChange={(event) => {
              if (event.target.value) {
                selectDay(event.target.value);
              }
            }}
          />
        </label>
        <button
          className="recovery-action"
          aria-label="Next day"
          onClick={() => selectDay(shiftDay(day, 1))}
        >
          →
        </button>
        <button
          className="recovery-action"
          onClick={() => selectDay(localDay(new Date()))}
        >
          Today
        </button>
      </div>
      {checkoff.isError && (
        <p role="alert">
          {checkoff.error.message} Save could not be confirmed. You can retry
          safely.
        </p>
      )}
      {archiveTool.isError && <p role="alert">{archiveTool.error.message}</p>}
      <div className="recovery-layout">
        <div className="recovery-tool-groups">
          {[false, true].map((custom) => (
            <section
              className="recovery-tools"
              key={String(custom)}
              aria-label={custom ? "Your custom tools" : "Research-based tools"}
            >
              <h2>{custom ? "Your custom tools" : "Research-based tools"}</h2>
              {custom && (
                <p className="recovery-section-copy">
                  Private activities, without research scores.
                </p>
              )}
              {activeTools
                .filter((tool) => tool.is_custom === custom)
                .map((tool) => (
                  <article className="recovery-tool" key={tool.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={tool.name}
                        checked={checkedTools.has(tool.id)}
                        disabled={checkoff.isPending || entries.isFetching}
                        onChange={(event) =>
                          checkoff.mutate({
                            toolId: tool.id,
                            date: day,
                            checked: event.target.checked,
                          })
                        }
                      />{" "}
                      <strong>{tool.name}</strong>
                    </label>
                    <p>{tool.description}</p>
                    {tool.evidence ? (
                      <>
                        <p>Estimated soreness relief</p>
                        <div
                          className="recovery-evidence-bar"
                          aria-hidden="true"
                        >
                          <span
                            style={{
                              width: `${Math.min(100, (Math.max(0, -tool.evidence.smd) / 2.26) * 100)}%`,
                            }}
                          />
                        </div>
                        <details className="recovery-evidence-details">
                          <summary>Research details</summary>
                          <p>
                            SMD {tool.evidence.smd.toFixed(2).replace("-", "−")}{" "}
                            · 95% CI{" "}
                            {tool.evidence.ci_lower
                              .toFixed(2)
                              .replace("-", "−")}{" "}
                            to{" "}
                            {tool.evidence.ci_upper
                              .toFixed(2)
                              .replace("-", "−")}
                          </p>
                        </details>
                      </>
                    ) : (
                      <p>Not research-rated</p>
                    )}
                    {tool.is_custom && (
                      <button
                        className="recovery-action"
                        disabled={archiveTool.isPending}
                        onClick={() =>
                          archiveTool.mutate({ toolId: tool.id, active: false })
                        }
                      >
                        Archive {tool.name}
                      </button>
                    )}
                  </article>
                ))}
              {custom && !activeTools.some((tool) => tool.is_custom) && (
                <p className="recovery-section-copy">No custom tools yet.</p>
              )}
            </section>
          ))}
        </div>
        <aside className="recovery-sidebar">
          <section className="recovery-panel" aria-label="Daily tracking">
            <h2>On {day}</h2>
            <p role="status">
              {checkedCount === 0
                ? "No activities recorded"
                : `${checkedCount} ${checkedCount === 1 ? "activity" : "activities"} recorded`}
            </p>
            <p role="status" className="recovery-save-status">
              {checkoff.isPending || (checkoff.isSuccess && entries.isFetching)
                ? "Saving…"
                : checkoff.isSuccess
                  ? "Saved"
                  : ""}
            </p>
            <p>
              This records activities, not how recovered you are. You do not
              need to do every tool.
            </p>
          </section>
          <section className="recovery-panel">
            <h2>Last 7 days</h2>
            <ul className="recovery-history">
              {days.map((date) => (
                <li key={date}>
                  <button
                    aria-pressed={date === day}
                    aria-label={`${date}: ${entries.data.filter((entry) => entry.performed_on === date).length} activities recorded`}
                    onClick={() => selectDay(date)}
                  >
                    <span>
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: "short" },
                      )}
                    </span>
                    <span>{new Date(`${date}T12:00:00`).getDate()}</span>
                    <strong>
                      {
                        entries.data.filter(
                          (entry) => entry.performed_on === date,
                        ).length
                      }
                    </strong>
                  </button>
                </li>
              ))}
            </ul>
            <p>
              Activities recorded, including archived tools. Zero means none
              recorded.
            </p>
          </section>
        </aside>
      </div>
      <details className="recovery-panel">
        <summary>About the evidence</summary>
        <p>
          Bars show the magnitude of soreness (DOMS) estimates, scaled to
          massage. They are not effectiveness percentages or proof that one tool
          beats another. Confidence intervals show uncertainty.
        </p>
        <p>
          The review studied single post-exercise interventions, not long-term
          training gains or performance recovery. Its search ended in 2017.
          Water immersion pools temperatures; it is not cold-water-only
          evidence.
        </p>
        <a
          href="https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00403/full"
          target="_blank"
          rel="noreferrer"
        >
          Dupuy et al. (2018), Table 1
        </a>
      </details>
      {!catalog.data.can_create_custom && (
        <p>Pro is required to add custom recovery tools.</p>
      )}
      {catalog.data.can_create_custom && addingTool && (
        <Modal
          labelledBy="recovery-custom-title"
          onClose={() => setAddingTool(false)}
          busy={createTool.isPending}
        >
          <form
            className="recovery-panel recovery-custom-form"
            onSubmit={(event) => {
              event.preventDefault();
              createTool.mutate(toolName.trim());
            }}
          >
            <h2 id="recovery-custom-title">Add a custom tool</h2>
            <p>Custom tools are private and not research-rated.</p>
            <label>
              Tool name{" "}
              <input
                maxLength={120}
                value={toolName}
                onChange={(event) => setToolName(event.target.value)}
                required
                disabled={createTool.isPending}
              />
            </label>
            <button
              className="recovery-action"
              type="submit"
              disabled={createTool.isPending || !toolName.trim()}
            >
              Add tool
            </button>
            <button
              className="recovery-action"
              type="button"
              disabled={createTool.isPending}
              onClick={() => setAddingTool(false)}
            >
              Cancel
            </button>
            {createTool.isError && (
              <p role="alert">{createTool.error.message}</p>
            )}
          </form>
        </Modal>
      )}
      {catalog.data.tools.some((tool) => !tool.is_active) && (
        <section className="recovery-panel">
          <h2>Archived tools</h2>
          <p>History is preserved. Restore a tool to track it again.</p>
          {catalog.data.tools
            .filter((tool) => !tool.is_active && tool.is_custom)
            .map((tool) => (
              <button
                key={tool.id}
                className="recovery-action"
                disabled={archiveTool.isPending}
                onClick={() =>
                  archiveTool.mutate({ toolId: tool.id, active: true })
                }
              >
                Restore {tool.name}
              </button>
            ))}
        </section>
      )}
    </section>
  );
}
