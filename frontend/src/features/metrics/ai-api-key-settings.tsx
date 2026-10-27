import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPersonalAiKey,
  removePersonalAiKey,
  savePersonalAiKey,
} from "./ai-insights-api";

export function AiApiKeySettings({
  busy,
  setupNeeded = false,
  available = false,
}: {
  busy: boolean;
  setupNeeded?: boolean;
  available?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const client = useQueryClient();
  const key = useQuery({
    queryKey: ["ai-personal-key"],
    queryFn: getPersonalAiKey,
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["ai-personal-key"] }),
      client.invalidateQueries({ queryKey: ["ai-insights-preview"] }),
    ]);
  }
  // Keep the credential out of mutation variables and persisted query data.
  const save = useMutation({
    mutationFn: () => savePersonalAiKey(draftKey.trim()),
    onSuccess: async () => {
      setDraftKey("");
      setExpanded(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: removePersonalAiKey,
    onSuccess: refresh,
  });
  const disabled = busy || save.isPending || remove.isPending || key.isPending;
  return (
    <details
      className="ai-provider-settings"
      aria-label="AI provider settings"
      open={expanded || setupNeeded}
      onToggle={(event) => {
        if (!setupNeeded) setExpanded(event.currentTarget.open);
      }}
    >
      <summary>
        <span>
          NVIDIA ·{" "}
          {key.isPending
            ? "Checking provider…"
            : key.error
              ? "Provider status unavailable"
              : key.data?.has_personal_key
                ? "Personal key saved"
                : available
                  ? "App key available"
                  : "Setup needed"}
        </span>
        <span>Provider settings</span>
      </summary>
      <div className="ai-provider-content">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled && draftKey.trim()) save.mutate();
          }}
        >
          <label htmlFor="nvidia-api-key">NVIDIA API key</label>
          <input
            id="nvidia-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              key.data?.has_personal_key ? "Enter replacement key" : "nvapi-…"
            }
            maxLength={512}
            value={draftKey}
            disabled={disabled}
            onChange={(event) => setDraftKey(event.target.value)}
          />
          <div className="ai-provider-actions">
            <button
              type="submit"
              disabled={
                disabled ||
                !/^nvapi-[A-Za-z0-9_-]+$/.test(draftKey.trim()) ||
                draftKey.trim().length < 12
              }
            >
              {save.isPending
                ? "Saving…"
                : key.data?.has_personal_key
                  ? "Replace key"
                  : "Save key"}
            </button>
            {key.data?.has_personal_key ? (
              <button
                className="ai-key-remove"
                type="button"
                disabled={disabled}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? "Removing…" : "Remove key"}
              </button>
            ) : null}
          </div>
        </form>
        <p>Saved encrypted. Uses your NVIDIA quota.</p>
        {save.isSuccess ? <p role="status">Key saved.</p> : null}
        {remove.isSuccess ? <p role="status">Personal key removed.</p> : null}
        {key.error || save.error || remove.error ? (
          <p role="alert" className="form-error">
            {(key.error ?? save.error ?? remove.error)?.message}
          </p>
        ) : null}
        {key.error && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void key.refetch()}
          >
            Retry provider status
          </button>
        )}
      </div>
    </details>
  );
}
