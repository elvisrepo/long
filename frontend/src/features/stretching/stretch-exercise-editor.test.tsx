import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StretchExerciseEditor } from "./stretch-exercise-editor";

describe("StretchExerciseEditor", () => {
  it("clears a selected replacement when removing the current image", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <StretchExerciseEditor
        exercise={{
          id: "custom",
          slug: "",
          phase: "lower-body",
          name: "Hip stretch",
          description: "",
          dosage: "",
          display_order: 1,
          is_visible: true,
          is_custom: true,
          is_active: true,
          image_url: "https://example.com/current.webp",
        }}
        onClose={vi.fn()}
        onSave={onSave}
        pending={false}
      />,
    );

    const replacement = new File(["new image"], "replacement.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText(/Illustration/), replacement);
    await user.click(
      screen.getByRole("checkbox", { name: "Remove current image" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save stretch" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ image: null, remove_image: true }),
    );
  });
});
