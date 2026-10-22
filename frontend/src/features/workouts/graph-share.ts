export async function shareGraph(
  svg: SVGSVGElement,
  title: string,
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute(
    "font-family",
    getComputedStyle(svg).fontFamily || "sans-serif",
  );
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("[fill], [stroke]").forEach((element) => {
    for (const attribute of ["fill", "stroke"])
      if (element.getAttribute(attribute)?.includes("var(")) {
        const match = element
          .getAttribute(attribute)!
          .match(/var\((--[^)]+)\)/);
        if (match)
          element.setAttribute(
            attribute,
            getComputedStyle(svg).getPropertyValue(match[1]).trim(),
          );
      }
  });
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const picture = new Image();
    await new Promise<void>((resolve, reject) => {
      picture.onload = () => resolve();
      picture.onerror = () =>
        reject(new Error("Graph image could not render."));
      picture.src = url;
    });
    const canvas = document.createElement("canvas"),
      bounds = svg.viewBox.baseVal;
    canvas.width = Math.ceil(bounds.width * 2);
    canvas.height = Math.ceil((bounds.height + 36) * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Graph images are unavailable in this browser.");
    ctx.scale(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = "#172b35";
    ctx.font = "14px sans-serif";
    ctx.fillText(title, 12, 23, bounds.width - 24);
    ctx.drawImage(picture, 0, 36, bounds.width, bounds.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Graph image could not save.")),
        "image/png",
      ),
    );
    const file = new File([blob], "workout-progress.png", {
      type: "image/png",
    });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title, files: [file] });
        return "Graph shared.";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return "Sharing cancelled.";
      }
    }
    const downloadUrl = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = downloadUrl;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    return "Graph image downloaded. You can share the PNG file.";
  } finally {
    URL.revokeObjectURL(url);
  }
}
