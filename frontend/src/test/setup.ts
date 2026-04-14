import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

//silence the jsdom scroll warning
window.scrollTo = () => {};

//makes that cleanup automatic after every test
afterEach(() => {
  cleanup();
});

// cleanup -- unmounts React trees after each test so one test does not leak DOM into the next
//
