import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPersonalAiKey,
  removePersonalAiKey,
  savePersonalAiKey,
} from "./ai-insights-api";

export function AiApiKeySettings({ busy }: { busy: boolean }) {
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
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: removePersonalAiKey,
    onSuccess: refresh,
  });
  const disabled = busy || save.isPending || remove.isPending || key.isPending;
  return (
    <section className="sleep-insights-card" aria-label="AI provider settings">
      <h2>Your API key</h2>
      <p>
        Use your own NVIDIA API key for AI suggestions. Requests use your
        provider account and its quota.
      </p>
      <p>
        {key.data?.has_personal_key
          ? "Personal key saved. Your reviews use this key."
          : "No personal key saved. Reviews use the app key when available."}
      </p>
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
          placeholder="nvapi-…"
          maxLength={512}
          value={draftKey}
          disabled={disabled}
          onChange={(event) => setDraftKey(event.target.value)}
        />
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
      </form>
      {key.data?.has_personal_key ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? "Removing…" : "Remove key"}
        </button>
      ) : null}
      <p>
        Stored encrypted on the server. The browser never receives a saved key.
      </p>
      {save.isSuccess ? <p role="status">Key saved.</p> : null}
      {remove.isSuccess ? <p role="status">Personal key removed.</p> : null}
      {key.error || save.error || remove.error ? (
        <p role="alert" className="form-error">
          {(key.error ?? save.error ?? remove.error)?.message}
        </p>
      ) : null}
    </section>
  );
}
