import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkoutLibrary } from "./workout-library";
import * as api from "./workout-api";

vi.mock("./workout-api");
it("filters favorites and multiple search terms without starting workouts", async () => {
  const select = vi.fn();
  const favorite: api.Exercise = {
    id: "bench",
    category_id: "chest",
    name: "Dumbbell bench press",
    tracking_type: "strength",
    weight_unit: "kg",
    distance_unit: "km",
    notes: "",
    weight_increment: "2.5",
    rest_seconds: 90,
    is_active: true,
    display_order: 10,
    is_favorite: true,
    trained_session_count: 3,
    last_used_on: "2026-09-30",
  };
  render(
    <WorkoutLibrary
      catalog={{
        categories: [
          { id: "chest", name: "Chest", display_order: 10, is_active: true },
          { id: "back", name: "Back", display_order: 20, is_active: true },
        ],
        exercises: [
          favorite,
          { ...favorite, id: "fly", name: "Dumbbell fly", is_favorite: false },
        ],
      }}
      busy={false}
      run={(action) => {
        void action();
      }}
      onSelect={select}
      selectionDisabled={false}
      selectingWorkout={false}
      onHistory={vi.fn()}
      onProgress={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Favorites", exact: true }),
  );
  expect(
    screen.queryByRole("button", { name: "View Dumbbell fly", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Back", exact: true }),
  ).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Search exercises"), "dum press");
  expect(
    screen.getByRole("button", {
      name: "View Dumbbell bench press",
      exact: true,
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/3 trained sessions.*2026-09-30/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", {
      name: "Unfavorite Dumbbell bench press",
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(api.saveExercise).toHaveBeenCalledWith("bench", {
      is_favorite: false,
    }),
  );
  expect(select).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText("Search exercises"));
  await userEvent.type(screen.getByLabelText("Search exercises"), "missing");
  expect(
    screen.getByText("No exercises match these filters."),
  ).toBeInTheDocument();
});
