import { type App, Platform, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type InkidianPlugin from "./main";

export interface InkidianSettings {
  /** Where "New note" puts notes when no note is open. */
  defaultFolder: string;
  /** Dark theme: invert the page so black ink stays readable, or keep white paper. */
  darkMode: "invert" | "paper";
  /** Show ![[Note.inkd]] as a picture in Markdown notes. */
  embeds: boolean;
  /** Show the notes the iPad app sends over the local network (D40). */
  livePreview: boolean;
  /** The key paired iPads seal their notes with, base64url; made when the live preview is first turned on. */
  liveKey: string;
  syncNoticeShown: boolean;
}

export const DEFAULT_SETTINGS: InkidianSettings = {
  defaultFolder: "Handwriting",
  darkMode: "invert",
  embeds: true,
  livePreview: false,
  liveKey: "",
  syncNoticeShown: false,
};

const DEFAULT_FOLDER = {
  name: "Default folder",
  desc: "The folder for new notes when no note is open. Otherwise new notes go into the open note's folder.",
};
const EMBEDS = {
  name: "Show embedded notes",
  desc: "Show embedded .inkd notes in Markdown notes as a picture of their first page. Uses an unofficial Obsidian feature; turn it off if embeds misbehave. Takes effect after restarting Obsidian.",
};
const LIVE_PREVIEW = {
  name: "Live preview from iPad (experimental)",
  desc: "Shows what you write in Inkidian on a paired iPad in the same network right away, before Obsidian Sync brings it. Turning it on shows a QR code to scan with the iPad's camera.",
};
const PAIR = {
  name: "Pair an iPad",
  desc: "Shows the QR code again, for another iPad or to make a new one.",
};
/** The live preview needs macOS's Bonjour for now (D40). */
const hasLivePreview = () => Platform.isDesktopApp && Platform.isMacOS;
const DARK_MODE = {
  name: "Pages in dark mode",
  desc: "How handwritten notes look when Obsidian uses a dark theme.",
  options: { invert: "Dark paper, light ink", paper: "White paper" },
};

export class InkidianSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: InkidianPlugin) {
    super(app, plugin);
  }

  /** Obsidian 1.13 and later: rendered by Obsidian and found by its settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { ...DEFAULT_FOLDER, control: { type: "text", key: "defaultFolder", placeholder: "Handwriting" } },
      { ...EMBEDS, control: { type: "toggle", key: "embeds" } },
      ...(hasLivePreview()
        ? [{ ...LIVE_PREVIEW, control: { type: "toggle" as const, key: "livePreview" } }, { ...PAIR, action: () => this.plugin.showPairing() }]
        : []),
      { name: DARK_MODE.name, desc: DARK_MODE.desc, control: { type: "dropdown", key: "darkMode", options: DARK_MODE.options } },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const { settings } = this.plugin;
    if (key === "defaultFolder") settings.defaultFolder = String(value).trim();
    else if (key === "embeds") settings.embeds = value === true;
    else if (key === "livePreview") return this.plugin.setLivePreview(value === true);
    else if (key === "darkMode") settings.darkMode = value === "paper" ? "paper" : "invert";
    await this.plugin.saveSettings({ rerender: key === "darkMode" });
  }

  /** Obsidian before 1.13. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(DEFAULT_FOLDER.name)
      .setDesc(DEFAULT_FOLDER.desc)
      .addText((text) =>
        text
          .setPlaceholder("Handwriting")
          .setValue(this.plugin.settings.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(EMBEDS.name)
      .setDesc(EMBEDS.desc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.embeds).onChange(async (value) => {
          this.plugin.settings.embeds = value;
          await this.plugin.saveSettings();
        }),
      );

    if (hasLivePreview()) {
      new Setting(containerEl)
        .setName(LIVE_PREVIEW.name)
        .setDesc(LIVE_PREVIEW.desc)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.livePreview).onChange((value) => this.plugin.setLivePreview(value)),
        );
      new Setting(containerEl)
        .setName(PAIR.name)
        .setDesc(PAIR.desc)
        .addButton((button) => button.setButtonText("Show QR code").onClick(() => this.plugin.showPairing()));
    }

    new Setting(containerEl)
      .setName(DARK_MODE.name)
      .setDesc(DARK_MODE.desc)
      .addDropdown((dropdown) =>
        dropdown
          .addOptions(DARK_MODE.options)
          .setValue(this.plugin.settings.darkMode)
          .onChange(async (value) => {
            this.plugin.settings.darkMode = value === "paper" ? "paper" : "invert";
            await this.plugin.saveSettings({ rerender: true });
          }),
      );
  }
}
