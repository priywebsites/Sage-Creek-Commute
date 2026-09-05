import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const posters = [
  ["P01", "https://sagecreek-commutes.replit.app/?source=P01"],
  ["P02", "https://sagecreek-commutes.replit.app/?source=P02"],
  ["P03", "https://sagecreek-commutes.replit.app/?source=P03"],
];

const outputDirectory = path.resolve("artifacts/sage-creek-commute/public/qr");
await mkdir(outputDirectory, { recursive: true });

for (const [posterId, url] of posters) {
  const generated = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
  const viewBox = generated.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) throw new Error(`Could not read generated QR viewBox for ${posterId}`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const labeled = generated
    .replace(`viewBox="0 0 ${viewBox[1]} ${viewBox[2]}"`, `viewBox="0 0 ${width} ${height + 14}"`)
    .replace("</svg>", `<text x="${width / 2}" y="${height + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#000000">${posterId}</text></svg>`);
  const filename = `poster-${posterId.slice(1).toLowerCase()}.svg`;
  await writeFile(path.join(outputDirectory, filename), labeled, "utf8");
}

console.log(`Generated ${posters.length} poster QR SVGs in ${outputDirectory}`);