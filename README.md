# Inkidian for Obsidian

Shows handwritten notes from [Inkidian](https://inkidian.com), the Apple Pencil app for iPad, right in your vault: on iPad, Mac, Windows and Linux. On the iPad it also opens notes, PDFs and images in Inkidian for editing.

Inkidian saves every note as an `.inkd` file next to your Markdown. This plugin reads those files; it doesn't need the app to show them.

## Features

- **Open `.inkd` notes** in their own view, page by page, with the paper (blank, lined, grid or dots) they were written on.
- **Embed notes** in Markdown with `![[Lecture 4.inkd]]`. The embed shows the first page.
- **Edit in Inkidian** (iPad): the round nib button in the top right corner of a note, and of every embedded note, opens it in the app. Back in Obsidian, the note updates on its own.
- **Annotate in Inkidian** (iPad): the same button on PDFs and images, the file menu or a command opens them in the app. The ink is saved into the PDF as standard annotations, so Obsidian's PDF viewer shows it too.
- **New note** command (iPad): starts a new note in Inkidian, in the open note's folder or a default folder.
- **Dark mode**: choose how pages look when Obsidian uses a dark theme.

The plugin makes no network requests and collects no data.

## Install

Search for **Inkidian** in Settings › Community plugins › Browse, then install and enable it.

Until the plugin is listed there, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat): install and enable BRAT, run the command *BRAT: Add a beta plugin for testing* and enter `toffalori/obsidian-inkidian`.

The Inkidian iPad app is in public beta on TestFlight: [inkidian.com](https://inkidian.com).

## Obsidian Sync

Obsidian Sync skips unknown file types by default. Turn on **Sync all other types** in Settings › Sync so your `.inkd` notes reach your other devices.

## The `.inkd` format

An `.inkd` file is plain JSON. The open specification is in [`format/SPEC.md`](format/SPEC.md), with a JSON Schema and sample files, so any program can read your notes, with or without Inkidian.

## Development

```sh
npm install
npm run dev     # rebuilds main.js on every change
npm test
npm run build   # type-checks and writes a minified main.js
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/inkidian/`.

Releases are built by GitHub Actions: pushing a tag that matches the version in `manifest.json` publishes `main.js`, `manifest.json` and `styles.css`.

## License

[MIT](LICENSE)
