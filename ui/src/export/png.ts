// Chart → PNG, via the browser's own SVG rasterizer.
//
// The SVG is same-origin inline content with no external images, so the canvas
// is never tainted and toBlob succeeds. Fonts render with whatever the browser
// resolves, which can differ slightly from the screen — the button's title says
// so rather than implying pixel fidelity.

import { downloadBlob } from "./csv";

/** Serialize an on-screen <svg> into a standalone PNG blob. */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // A serialized SVG needs an explicit namespace and explicit dimensions; the
  // live element gets both from its document and its layout, and a detached
  // copy gets neither.
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const width = Number(svg.getAttribute("width") ?? svg.clientWidth ?? 0) || 640;
  const height = Number(svg.getAttribute("height") ?? svg.clientHeight ?? 0) || 360;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // A transparent PNG dropped into a document looks broken. Paint the
  // background the chart is drawn against.
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  clone.insertBefore(background, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const image = new Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("this browser did not provide a 2D canvas context");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("the browser could not encode the chart as a PNG"));
    }, "image/png");
  });
}

export async function downloadPNG(svg: SVGSVGElement, filename: string): Promise<void> {
  downloadBlob(await svgToPngBlob(svg), filename);
}
