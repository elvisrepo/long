import { useRef, useState, type FormEvent } from "react";

import { Modal } from "../../components/modal";
import type { StretchExercise, StretchExerciseInput } from "./stretching-api";
import { StretchImage } from "./stretch-image";

type Props = {
  exercise?: StretchExercise;
  onClose: () => void;
  onSave: (input: StretchExerciseInput) => void;
  pending: boolean;
  error?: string;
};

export function StretchExerciseEditor({
  exercise,
  onClose,
  onSave,
  pending,
  error,
}: Props) {
  const [phase, setPhase] = useState<StretchExercise["phase"]>(
    exercise?.phase ?? "lower-body",
  );
  const [name, setName] = useState(exercise?.name ?? "");
  const [description, setDescription] = useState(exercise?.description ?? "");
  const [dosage, setDosage] = useState(exercise?.dosage ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fileError, setFileError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      phase,
      name: name.trim(),
      description: description.trim(),
      dosage: dosage.trim(),
      image,
      remove_image: removeImage,
    });
  };

  return (
    <Modal
      labelledBy="stretch-editor-title"
      onClose={onClose}
      closeOnBackdrop={!pending}
      className="stretching-catalog-dialog"
    >
      <div className="metric-dialog-header">
        <h2 id="stretch-editor-title">
          {exercise ? "Edit your stretch" : "Add a custom stretch"}
        </h2>
        <button
          type="button"
          className="metric-dialog-close"
          aria-label="Close stretch editor"
          onClick={onClose}
          disabled={pending}
        >
          Close
        </button>
      </div>
      <form className="stretching-editor-form" onSubmit={submit}>
        <label>
          Phase
          <select
            value={phase}
            onChange={(event) =>
              setPhase(event.target.value as StretchExercise["phase"])
            }
          >
            <option value="lower-body">Lower body &amp; hips</option>
            <option value="upper-body">Upper body &amp; posture</option>
          </select>
        </label>
        <label>
          Title
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Description and instructions
          <textarea
            maxLength={500}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Suggested duration or repetitions
          <input
            maxLength={120}
            value={dosage}
            onChange={(event) => setDosage(event.target.value)}
          />
        </label>
        {exercise?.image_url && !removeImage && (
          <StretchImage
            className="stretching-editor-preview"
            src={exercise.image_url}
            alt="Current stretch illustration"
          />
        )}
        <label>
          Illustration (JPEG, PNG, or WebP; up to 2 MB)
          <input
            type="file"
            ref={imageInput}
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && file.size > 2 * 1024 * 1024) {
                setFileError("Choose an image no larger than 2 MB.");
                setImage(null);
                return;
              }
              setFileError("");
              setImage(file);
              if (file) setRemoveImage(false);
            }}
          />
        </label>
        {exercise?.image_url && (
          <label className="stretching-editor-checkbox">
            <input
              type="checkbox"
              checked={removeImage}
              onChange={(event) => {
                const shouldRemove = event.target.checked;
                setRemoveImage(shouldRemove);
                if (shouldRemove) {
                  setImage(null);
                  setFileError("");
                  if (imageInput.current) imageInput.current.value = "";
                }
              }}
            />
            Remove current image
          </label>
        )}
        {(fileError || error) && <p role="alert">{fileError || error}</p>}
        <div className="stretching-editor-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !!fileError}>
            {pending ? "Saving…" : "Save stretch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
