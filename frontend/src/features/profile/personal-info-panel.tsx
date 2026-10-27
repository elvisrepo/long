import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  updatePersonalInfo,
  type PersonalInfo,
  type PersonalInfoInput,
} from "./personal-info-api";
import { usePersonalInfoQuery } from "./use-personal-info-query";
import { EstimatedBmrSummary } from "./estimated-bmr-summary";

export function PersonalInfoPanel({ reveal = false }: { reveal?: boolean }) {
  const query = usePersonalInfoQuery();
  return (
    <section
      id="personal-info"
      className="subscription-card"
      aria-label="Personal info"
    >
      <details className="settings-disclosure" open={reveal}>
        <summary>
          <h2>Personal info</h2>
          <span>Birth date, sex &amp; height</span>
        </summary>
        <div className="settings-disclosure-content">
          <p className="metric-meta">
            Used to estimate your resting energy needs. Weight comes from your
            latest recorded body weight.
          </p>
          {query.isPending ? (
            <p>Loading personal info…</p>
          ) : query.data ? (
            <PersonalInfoForm profile={query.data} />
          ) : (
            <div role="alert">
              <p>Personal info failed to load.</p>
              <button type="button" onClick={() => void query.refetch()}>
                Retry personal info
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function PersonalInfoForm({ profile }: { profile: PersonalInfo }) {
  const queryClient = useQueryClient();
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? "");
  const [sex, setSex] = useState<PersonalInfoInput["sex"]>(profile.sex);
  const [height, setHeight] = useState(profile.height_cm?.toString() ?? "");
  const mutation = useMutation({
    mutationFn: (input: PersonalInfoInput) => updatePersonalInfo(input),
    onSuccess: (data) => queryClient.setQueryData(["personal-info"], data),
  });
  async function save(input: PersonalInfoInput, clear = false) {
    try {
      await mutation.mutateAsync(input);
      if (clear) {
        setDateOfBirth("");
        setSex(null);
        setHeight("");
      }
    } catch {
      /* The mutation renders the error without discarding the draft. */
    }
  }
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            date_of_birth: dateOfBirth || null,
            sex,
            height_cm: height === "" ? null : Number(height),
          });
        }}
      >
        <fieldset
          disabled={mutation.isPending}
          className="personal-info-fields"
        >
          <label>
            Date of birth
            <input
              type="date"
              value={dateOfBirth}
              onChange={(event) => {
                setDateOfBirth(event.target.value);
                mutation.reset();
              }}
            />
          </label>
          <label>
            Sex for calculation
            <select
              value={sex ?? ""}
              onChange={(event) => {
                setSex(
                  (event.target.value || null) as PersonalInfoInput["sex"],
                );
                mutation.reset();
              }}
              aria-describedby="bmr-sex-help"
            >
              <option value="">Not specified</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <label>
            Height (cm)
            <input
              type="number"
              min="50"
              max="250"
              step="0.1"
              value={height}
              onChange={(event) => {
                setHeight(event.target.value);
                mutation.reset();
              }}
            />
          </label>
          <div className="personal-info-actions">
            <button type="submit">
              {mutation.isPending ? "Saving…" : "Save personal info"}
            </button>
            <button
              type="button"
              className="metrics-secondary-action"
              onClick={() =>
                void save(
                  { date_of_birth: null, sex: null, height_cm: null },
                  true,
                )
              }
            >
              Clear personal info
            </button>
          </div>
        </fieldset>
        <p id="bmr-sex-help" className="metric-meta">
          The formula uses a male or female coefficient. You can leave this
          unspecified.
        </p>
        {mutation.isError ? (
          <p role="alert" className="error-text">
            {mutation.error.message}
          </p>
        ) : null}
        {mutation.isSuccess ? <p role="status">Personal info saved.</p> : null}
      </form>
      <div className="personal-info-estimate">
        <h3>Estimated BMR</h3>
        <EstimatedBmrSummary estimate={profile.estimated_bmr} />
      </div>
    </>
  );
}
