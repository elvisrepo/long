import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getStretchImage } from "./stretching-api";
import { StretchImage } from "./stretch-image";

vi.mock("./stretching-api", () => ({ getStretchImage: vi.fn() }));

describe("StretchImage", () => {
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL",
  );
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL",
  );

  afterEach(() => {
    vi.resetAllMocks();
    if (createObjectUrlDescriptor) {
      Object.defineProperty(URL, "createObjectURL", createObjectUrlDescriptor);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (revokeObjectUrlDescriptor) {
      Object.defineProperty(URL, "revokeObjectURL", revokeObjectUrlDescriptor);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("reloads an authenticated image when its versioned URL changes", async () => {
    vi.mocked(getStretchImage).mockResolvedValue(
      new Blob(["image"], { type: "image/webp" }),
    );
    const createObjectURL = vi.fn(() => "blob:stretch-image");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const { rerender } = render(
      <StretchImage
        src="/api/v1/stretching/exercises/custom/image/?v=one"
        alt="Custom stretch"
      />,
    );
    await screen.findByRole("img", { name: "Custom stretch" });

    rerender(
      <StretchImage
        src="/api/v1/stretching/exercises/custom/image/?v=two"
        alt="Custom stretch"
      />,
    );

    await waitFor(() => expect(getStretchImage).toHaveBeenCalledTimes(2));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});
