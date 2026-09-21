// Apply the saved appearance before rendering, without requiring inline scripts.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("longevity-theme") === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}
