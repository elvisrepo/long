import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

//silence the jsdom scroll warning
window.scrollTo = () => {};

// jsdom does not implement the native dialog lifecycle. Browser checks cover
// focus containment and Escape; component tests cover opening and closing.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

//makes that cleanup automatic after every test
afterEach(() => {
  cleanup();
});

// cleanup -- unmounts React trees after each test so one test does not leak DOM into the next
//
