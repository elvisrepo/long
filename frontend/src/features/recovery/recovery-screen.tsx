import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "../../components/page-header";
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

export function RecoveryScreen() {
  const queryClient = useQueryClient();
  const owner = useMeQuery().data?.email;
  const [day, setDay] = useState(() => localDay(new Date()));
  const [toolName, setToolName] = useState("");
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
      />
      <label className="recovery-date">
        Tracking date{" "}
        <input
          type="date"
          value={day}
          onChange={(event) => {
            if (event.target.value) {
              setDay(event.target.value);
              checkoff.reset();
            }
          }}
        />
      </label>
      {checkoff.isError && (
        <p role="alert">
          {checkoff.error.message} Save could not be confirmed. You can retry
          safely.
        </p>
      )}
      {archiveTool.isError && <p role="alert">{archiveTool.error.message}</p>}
      <div className="recovery-layout">
        <div className="recovery-tools">
          {activeTools.map((tool) => (
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
                  <div className="recovery-evidence-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (Math.max(0, -tool.evidence.smd) / 2.26) * 100)}%`,
                      }}
                    />
                  </div>
                  <p>
                    SMD {tool.evidence.smd.toFixed(2).replace("-", "−")} · 95%
                    CI {tool.evidence.ci_lower.toFixed(2).replace("-", "−")} to{" "}
                    {tool.evidence.ci_upper.toFixed(2).replace("-", "−")}
                  </p>
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
        </div>
        <aside className="recovery-sidebar">
          <section className="recovery-panel" aria-label="Daily tracking">
            <h2>On {day}</h2>
            <p role="status">
              {checkedCount} of {activeTools.length} tools checked off
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
                  <span>{date}</span>
                  <strong>
                    {
                      entries.data.filter(
                        (entry) => entry.performed_on === date,
                      ).length
                    }{" "}
                    check-offs
                  </strong>
                </li>
              ))}
            </ul>
            <p>Includes check-offs for archived tools.</p>
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
      {catalog.data.can_create_custom && (
        <form
          className="recovery-panel recovery-custom-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTool.mutate(toolName.trim());
          }}
        >
          <h2>Add a custom tool</h2>
          <p>Custom tools are private and not research-rated.</p>
          <label>
            Tool name{" "}
            <input
              maxLength={120}
              value={toolName}
              onChange={(event) => setToolName(event.target.value)}
              required
            />
          </label>
          <button
            className="recovery-action"
            type="submit"
            disabled={createTool.isPending || !toolName.trim()}
          >
            Add tool
          </button>
          {createTool.isError && <p role="alert">{createTool.error.message}</p>}
        </form>
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
