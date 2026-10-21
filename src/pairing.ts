import { type App, Modal, Setting } from "obsidian";
import qrcode from "qrcode-generator";
import { h, SVG_NS, type SvgNode, toDom } from "./svg";

/** A new random key for the live preview, 32 bytes in base64url (D40). */
export function newPairingKey(): string {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A QR code as an SVG tree, black on white in any theme so cameras read it. */
export function qrSvg(text: string): SvgNode {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }
  const size = count + 2 * margin;
  return h("svg", { xmlns: SVG_NS, viewBox: `0 0 ${size} ${size}`, "shape-rendering": "crispEdges", class: "inkidian-qr" }, [
    h("rect", { width: size, height: size, fill: "#fff" }),
    h("path", { d: path, fill: "#000" }),
  ]);
}

/** Shows the QR code an iPad scans with its camera to pair with this Mac. */
export class PairingModal extends Modal {
  constructor(
    app: App,
    private readonly link: string,
    private readonly onNewCode: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Pair your iPad");
    this.contentEl.createEl("p", {
      text: "Scan this code with the camera on your iPad. Inkidian opens and asks to pair with this Mac. Each iPad scans it once.",
    });
    this.contentEl.appendChild(toDom(qrSvg(this.link)));
    new Setting(this.contentEl)
      .setDesc("A new code unpairs the iPads that scanned this one.")
      .addButton((button) =>
        button.setButtonText("New code").onClick(() => {
          this.close();
          this.onNewCode();
        }),
      )
      .addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
