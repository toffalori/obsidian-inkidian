import { type App, PluginSettingTab, Setting } from "obsidian";
import type InkidianPlugin from "./main";

export interface InkidianSettings {
  /** Where "New note" puts notes when no note is open. */
  defaultFolder: string;
  /** Dark theme: invert the page so black ink stays readable, or keep white paper. */
  darkMode: "invert" | "paper";
  /** Show ![[Note.inkd]] as a picture in Markdown notes. */
  embeds: boolean;
  syncNoticeShown: boolean;
}

export const DEFAULT_SETTINGS: InkidianSettings = {
  defaultFolder: "Handwriting",
  darkMode: "invert",
  embeds: true,
  syncNoticeShown: false,
};

export class InkidianSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: InkidianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc("The folder for new notes when no note is open. Otherwise new notes go into the open note's folder.")
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
      .setName("Show embedded notes")
      .setDesc("Show embedded .inkd notes in Markdown notes as a picture of their first page. Uses an unofficial Obsidian feature; turn it off if embeds misbehave. Takes effect after restarting Obsidian.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.embeds).onChange(async (value) => {
          this.plugin.settings.embeds = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Pages in dark mode")
      .setDesc("How handwritten notes look when Obsidian uses a dark theme.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("invert", "Dark paper, light ink")
          .addOption("paper", "White paper")
          .setValue(this.plugin.settings.darkMode)
          .onChange(async (value) => {
            this.plugin.settings.darkMode = value === "paper" ? "paper" : "invert";
            await this.plugin.saveSettings({ rerender: true });
          }),
      );
  }
}
