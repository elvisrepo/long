// Apply the saved appearance before rendering, without requiring inline scripts.
try {
  const savedTheme = localStorage.getItem("longevity-theme");
  document.documentElement.dataset.theme =
    savedTheme === "light" || savedTheme === "sand" ? savedTheme : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}
