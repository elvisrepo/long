import { TrackingDateControls } from "../../components/tracking-date-controls";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

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
import { localDay, trackingDateLabel } from "./recovery-dates";

export function RecoveryScreen() {
  const queryClient = useQueryClient();
  const owner = useMeQuery().data?.email;
  const today = localDay(new Date());
  const [day, setDay] = useState(() => localDay(new Date()));
  const [toolName, setToolName] = useState("");
  const [addingTool, setAddingTool] = useState(false);
  function selectDay(date: string) {
    setDay(date);
    checkoff.reset();
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
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
    queryFn: () => getRecoveryEntries(day, day),
    placeholderData: keepPreviousData,
    enabled: !!owner,
  });
  const history = useQuery({
    queryKey: ["recovery", owner, "entries", "history", today],
    queryFn: () => getRecoveryEntries(days[0], today),
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
  if (catalog.isPending || entries.isPending || history.isPending)
    return <PageState message="Loading recovery tools…" />;
  if (catalog.isError || entries.isError || history.isError)
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
      <header className="recovery-heading">
        <h1>Recovery</h1>
        <p>Log the activities you used.</p>
      </header>
      <section
        className="recovery-panel recovery-day-context"
        aria-label="Daily tracking"
      >
        <div className="recovery-day-header tracking-day-header">
          <div>
            <h2>{trackingDateLabel(day, today)}</h2>
            <p role="status">
              {entries.isFetching
                ? "Loading activities…"
                : checkedCount === 0
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
          </div>
          <TrackingDateControls
            day={day}
            today={today}
            onSelectDay={selectDay}
          />
        </div>
        <div role="group" aria-label="Last 7 days">
          <ul className="recovery-history">
            {days.map((date) => (
              <li key={date}>
                <button
                  aria-pressed={date === day}
                  aria-label={`${date}: ${history.data.filter((entry) => entry.performed_on === date).length} activities recorded`}
                  onClick={() => selectDay(date)}
                >
                  <span>
                    {new Date(`${date}T12:00:00`).toLocaleDateString(
                      undefined,
                      { weekday: "short" },
                    )}
                  </span>
                  <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                  <small>
                    {
                      history.data.filter(
                        (entry) => entry.performed_on === date,
                      ).length
                    }{" "}
                    logged
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <p className="recovery-history-caption">
            Last 7 days ·{" "}
            {new Set(history.data.map((entry) => entry.performed_on)).size} days
            with records · counts include archived tools
          </p>
        </div>
      </section>
      {checkoff.isError && (
        <p role="alert">
          {checkoff.error.message} Save could not be confirmed. You can retry
          safely.
        </p>
      )}
      {archiveTool.isError && <p role="alert">{archiveTool.error.message}</p>}
      <div className="recovery-tool-groups">
        {[false, true].map((custom) => (
          <section
            className={`recovery-tools${custom ? " recovery-panel recovery-custom-tools" : ""}`}
            key={String(custom)}
            aria-label={custom ? "Your custom tools" : "Recovery tools"}
          >
            <div className="recovery-section-heading">
              <div>
                <h2>{custom ? "Your custom tools" : "Recovery tools"}</h2>
                {custom && (
                  <p className="recovery-section-copy">
                    Private activities · not research-rated
                  </p>
                )}
              </div>
              {custom && catalog.data.can_create_custom && (
                <button
                  aria-label="Add custom tool"
                  className="recovery-action"
                  onClick={() => {
                    createTool.reset();
                    setAddingTool(true);
                  }}
                >
                  + Add tool
                </button>
              )}
              {!custom && <small>Choose what you did</small>}
            </div>
            <div className="recovery-tool-list">
              {activeTools
                .filter((tool) => tool.is_custom === custom)
                .map((tool) => (
                  <article
                    className={`recovery-tool${checkedTools.has(tool.id) ? " recovery-tool-checked" : ""}`}
                    key={tool.id}
                  >
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
                      />
                      <span className="recovery-tool-icon">
                        <RecoveryToolIcon
                          name={tool.is_custom ? "" : tool.name}
                        />
                      </span>
                      <span className="recovery-tool-text">
                        <strong>{tool.name}</strong>
                        {checkedTools.has(tool.id) && (
                          <small className="recovery-recorded-label">
                            Recorded
                          </small>
                        )}
                        {tool.description && (
                          <span className="recovery-tool-description">
                            {tool.description}
                          </span>
                        )}
                      </span>
                    </label>
                    {tool.evidence ? (
                      <details className="recovery-evidence-details">
                        <summary>Research details</summary>
                        <p>Soreness (DOMS) estimate</p>
                        <p>
                          SMD {tool.evidence.smd.toFixed(2).replace("-", "−")} ·
                          95% CI{" "}
                          {tool.evidence.ci_lower.toFixed(2).replace("-", "−")}{" "}
                          to{" "}
                          {tool.evidence.ci_upper.toFixed(2).replace("-", "−")}
                        </p>
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
                        <p>
                          {tool.evidence.subjects} subjects ·{" "}
                          {tool.evidence.experimental_groups} experimental
                          groups
                          <br />
                          {tool.evidence.citation}
                        </p>
                      </details>
                    ) : (
                      <p className="recovery-unrated">Not research-rated</p>
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
            </div>
            {!custom && (
              <p className="recovery-section-copy recovery-checklist-note">
                Record any that apply. You do not need to use every tool.
              </p>
            )}
            {custom && !activeTools.some((tool) => tool.is_custom) && (
              <div className="recovery-custom-empty">
                <span aria-hidden="true">+</span>
                <div>
                  <strong>No custom tools yet</strong>
                  <p>Add an activity you already use.</p>
                </div>
              </div>
            )}
            {custom && !catalog.data.can_create_custom && (
              <p className="recovery-section-copy">
                Pro is required to add custom recovery tools.
              </p>
            )}
          </section>
        ))}
      </div>
      <details className="recovery-panel">
        <summary>About the research</summary>
        <p>
          Research describes muscle soreness (DOMS), not overall recovery. Bars
          show the magnitude of soreness estimates, scaled to massage. They are
          not effectiveness percentages or proof that one tool beats another.
          Confidence intervals show uncertainty.
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

function RecoveryToolIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Massage: "M5 13c3-5 5-5 7-2l3-5 3 2-3 7c-2 3-7 4-10 1z",
    "Active recovery": "m5 18 5-8 4 3 5-8M8 5l3 1M12 19h7",
    "Compression garments": "m7 3 3 2h4l3-2 3 5-4 3v10H8V11L4 8z",
    "Cryotherapy / cryostimulation":
      "M12 3v18M4 7l16 10M4 17 20 7M9 5l3 3 3-3M9 19l3-3 3 3",
    "Water immersion": "M3 15q3-4 6 0t6 0 6 0M3 19q3-4 6 0t6 0 6 0M8 5h8v6H8z",
    "Contrast water therapy": "M7 4v13m-3-3 3 3 3-3M17 20V7m-3 3 3-3 3 3",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? "M12 5v14M5 12h14"} />
    </svg>
  );
}
