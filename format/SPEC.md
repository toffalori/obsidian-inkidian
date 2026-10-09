# Inkidian File Format (`.inkd`)

**Format version 1** · Status: **final**. New optional fields may still be added (see [§2](#2-versioning-and-compatibility)), and every change is listed in the [changelog](#10-changelog).

An `.inkd` file holds one handwritten note: a list of fixed-size pages with ink strokes on them. The file is plain JSON, so any program can read and render it without dependencies. That includes the Obsidian plugin.

The key words MUST, SHOULD and MAY are used as described in RFC 2119.

## 1. File basics

- The file extension is `.inkd`. The file is UTF-8 without a BOM and contains a single JSON object.
- Whitespace is not significant. Writers MAY pretty-print.
- The machine-readable schema is [`inkd.schema.json`](inkd.schema.json) (JSON Schema 2020-12). It describes what a v1 writer produces. Readers accept more than that (see [§7](#7-reader-leniency)).
- [`samples/`](samples/) contains sample files. The iPad app and the plugin both test against them. `app-written.inkd` was written by the iPad app (in the simulator); the others are synthetic. `app-written.pdf` is a PDF with ink written by the app ([§9](#9-ink-in-pdf-files)).

## 2. Versioning and compatibility

- `formatVersion` is an integer. It is bumped only for changes that older readers cannot handle safely, such as a renamed or removed field, a field whose meaning changes, or a different container format.
- Additive changes do not bump the version. Examples are a new optional field, a new tool or a new background type.
- A reader MUST refuse a file whose `formatVersion` is higher than the highest version it supports. It shows a message (for example "This note was created with a newer version of Inkidian") instead of rendering a partial result.
- A reader MUST ignore unknown fields.
- When a writer saves a file back, it MUST keep the unknown fields of every object it did not change: the root, `app`, `page`, each page, `background` and each stroke. A modified stroke MAY lose its unknown fields, for example one that was split by the eraser or moved with the lasso. A deleted object loses them.

## 3. Document

```json
{
  "format": "inkidian",
  "formatVersion": 1,
  "id": "0b6c1d52-5f0e-4c1a-9a43-2f6f3c1e8d10",
  "createdAt": "2026-10-06T17:00:00Z",
  "modifiedAt": "2026-10-06T17:05:00Z",
  "app": { "name": "Inkidian", "version": "0.1.0" },
  "page": { "width": 1240, "height": 1754, "unit": "pt" },
  "pages": [ … ]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `format` | string | yes | Always `"inkidian"`. A reader MUST reject any other value. |
| `formatVersion` | integer | yes | `1` for this spec. |
| `id` | string | yes | Document ID. |
| `createdAt` | string | yes | Creation time in RFC 3339 format and UTC (`Z`). Fractional seconds are optional. |
| `modifiedAt` | string | yes | Time of the last change, in the same format. A writer updates it on every save that changes content. |
| `app` | object | no | The last writer: `name` and `version` (strings). For information only. |
| `page` | object | yes | Size of every page in the note: `width` and `height` (numbers > 0) and `unit` (always `"pt"`). Readers accept any size. The iPad app creates A4 (1240 × 1754, the default), A5 (874 × 1240) or US Letter (1275 × 1650), all at 1240 pt per 210 mm. It can also create the size of the iPad's screen in points, for example 1032 × 1376 on a 13-inch iPad Pro. Every size can be portrait or landscape. |
| `pages` | array | yes | The pages in order. At least one. |

IDs (of documents, pages and strokes) are opaque, case-sensitive strings that are unique within the file. Writers SHOULD use UUIDs.

## 4. Coordinate system

- All coordinates are **page coordinates** in `pt`. The origin is the top-left corner of the page, x grows to the right and y grows downward.
- Coordinates are rounded to 2 decimal places.
- Each stroke belongs to exactly one page, and its points are relative to that page. The iPad app assigns a stroke to the page that contains its first point.
- Points MAY lie outside the page, for example when a stroke runs over the page edge. Renderers clip every page to `0…width × 0…height`.

## 5. Pages and backgrounds

```json
{
  "id": "4e0f8a7b-2c3d-4b5e-8f60-718293a4b5c6",
  "background": { "type": "lined", "spacing": 32, "color": "#D0D7E2" },
  "strokes": [ … ]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Page ID. |
| `background` | object | yes | Background pattern, see below. |
| `strokes` | array | yes | Strokes in drawing order, so later strokes are drawn on top. May be empty. |

`background`:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `type` | string | yes | `blank`, `lined`, `grid` or `dots`. |
| `spacing` | number | no | Distance between lines or dots in pt, > 0. Default `32`. |
| `color` | string | no | `#RRGGBB`. Default `#D0D7E2`. |

The paper is white (`#FFFFFF`). The background pattern is drawn on the paper underneath all strokes and is not part of the ink. The geometry below is exact so that the app and the plugin draw the same thing. In it, `s` is the spacing, and only lines and dots strictly inside the page are drawn:

- `blank`: no pattern.
- `lined`: horizontal lines at `y = k·s` for k = 1, 2, …, across the full page width, 1 pt wide.
- `grid`: the `lined` pattern plus vertical lines at `x = k·s`, across the full page height, 1 pt wide.
- `dots`: filled circles with a radius of 1 pt at every `(i·s, k·s)` for i, k ≥ 1.

## 6. Strokes

```json
{
  "id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  "tool": "pen",
  "color": "#1C1C1E",
  "opacity": 1,
  "baseWidth": 2.5,
  "points": [[412.5, 300.25, 0.42, 0, 0.785, 0.96], …]
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stroke ID. Prepares merging at the stroke level. Renderers do not use it. |
| `tool` | string | yes | `pen`, `pencil` or `marker` (highlighter). |
| `color` | string | yes | `#RRGGBB` in sRGB. |
| `opacity` | number | yes | 0–1. See [§8](#8-rendering-model). |
| `baseWidth` | number | yes | Nominal stroke width in pt (> 0). It is the width at pressure 0.5, see [§8](#8-rendering-model). |
| `points` | array | yes | Samples along the stroke. At least one. |

Each point is an array of exactly 6 numbers:

| Index | Name | Unit and range | Precision |
|---|---|---|---|
| 0 | `x` | pt | 2 decimals |
| 1 | `y` | pt | 2 decimals |
| 2 | `pressure` | 0–1 | 3 decimals |
| 3 | `t` | seconds since the first point of the stroke, never decreasing | 3 decimals |
| 4 | `azimuth` | radians: the direction the stylus points to in the page plane | 3 decimals |
| 5 | `altitude` | radians: 0 = flat on the screen, π/2 = perpendicular to it | 3 decimals |

- Points are the stroke's input samples in drawing order. The iPad app stores PencilKit's stroke path control points unchanged, and PencilKit treats them as a uniform cubic B-spline. Renderers SHOULD draw a smooth curve along the points and MAY reproduce the B-spline exactly.
- Readers MUST ignore any elements in a point after the sixth. They are reserved for future versions. v1 writers write exactly 6.
- When a value is not known, writers use these defaults: pressure `0.5`, azimuth `0`, altitude `1.571` (π/2). This happens, for example, for input from a mouse.

## 7. Reader leniency

Every file written by a v1 writer validates against the schema. Readers accept more than that, so that files from newer app versions still render as well as possible:

- An unknown `tool` is rendered like `pen`.
- An unknown `background.type` is rendered like `blank`.
- A missing `background.spacing` or `background.color` falls back to the defaults in [§5](#5-pages-and-backgrounds).
- Some content cannot be rendered: the file is not JSON, `format` is not `"inkidian"`, or required fields are missing or have the wrong type. The reader shows an error message instead of crashing.

## 8. Rendering model

> Calibrated against PencilKit in M1 (decision D7). Frozen together with v1 (M4).

`baseWidth` and the widths below are *visible* widths in pt. `pressure` (`p`, clamped to 0–1) means something different per tool. For the pen it sets the width; for the pencil and the marker it sets how dark the ink is. For every tool, `p = 0.5` is a normal stroke.

| Tool | Width at the point | Alpha at the point | Blending |
|---|---|---|---|
| `pen` | `baseWidth · (0.25 + 1.5·p)` | `opacity` | normal |
| `pencil` | `baseWidth` | `opacity · (0.55 + 0.45·p)` | normal. Renderers MAY add a grain texture. |
| `marker` | `baseWidth` | `opacity · (0.45 + 0.45·p)` | multiply |

- The pen width range is 0.25× to 1.75× `baseWidth`. This equals [perfect-freehand](https://github.com/steveruizok/perfect-freehand) with `size = baseWidth`, `thinning = 0.75` and linear easing.
- Renderers that can't vary alpha along a path MAY use the stroke's mean `p` for the whole stroke.
- For `pen` and `marker`, a stroke that crosses itself does not get darker where it overlaps.
- The iPad app converts PencilKit's point size and opacity to these values when writing, and back when reading (`InkdCodec`). For the pen, `baseWidth` is the median width of the stroke. The other tools have a constant width.
- Strokes have round caps and round joins.
- A stroke with a single point, or with zero length, is drawn as a dot whose diameter is its width.
- Dark mode is a renderer option. A renderer MAY show the paper dark and invert the lightness of near-black ink so that it stays readable. The file always stores the colors as they were written.

## 9. Ink in PDF files

The iPad app also writes ink into PDF files in the vault (milestone M7). The file stays an ordinary PDF: every PDF viewer shows the ink, Obsidian's included, and Inkidian can edit it again without loss.

### 9.1 Incremental updates only

- Inkidian never changes the bytes a PDF already has. It appends its ink as an *incremental update* (ISO 32000-2 §7.5.6): new objects, a cross-reference section and a trailer after the file's last `%%EOF`. Cutting the file back to its old length restores the original exactly.
- The update starts with the comment line `%Inkidian 1`. Its trailer, or the dictionary of its cross-reference stream, contains `/InkidianBase n`: the length in bytes of the file before the update.
- If the newest update in a file is Inkidian's, a save replaces it: the writer cuts the file back to `InkidianBase` bytes and appends a new update. Without any ink, the PDF goes back to exactly its original bytes.
- If another program added its own update after Inkidian's, the writer keeps everything and appends a new update on top.
- The new cross-reference section is of the same kind as the newest one before it: a table after a table, a stream after a stream.
- A writer MUST NOT write into encrypted PDFs (`/Encrypt` in the trailer) or into PDFs whose cross-reference data or page tree it cannot read. The app shows them read-only.
- Before it replaces the file, the writer reads the result back and checks the page count, the page sizes and the ink it wrote. The file is then replaced atomically.

### 9.2 One ink annotation per stroke

Each stroke is an annotation on its page: pen and pencil strokes of subtype `/Ink` (ISO 32000-2 §12.5.6.13), marker strokes of subtype `/Highlight` (§12.5.6.10), so that viewers which draw highlights themselves, such as Preview, multiply them with the page as well. Inkidian only removes and adds its own annotations; all others stay. Readers recognize Inkidian's annotations by `/NM` or `/InkidianStroke`, whatever their subtype.

| Key | Value |
|---|---|
| `/NM` | `(inkidian:<stroke id>)`. This prefix marks Inkidian's annotations. |
| `/Rect` | The ink's bounding box in default user space, including half the stroke width. |
| `/InkList` | One path: the stroke's points in default user space. |
| `/C`, `/CA` | The stroke's color (DeviceRGB) and its alpha from [§8](#8-rendering-model) at the mean pressure. For a `/Highlight`, `/C` is that color over white, `1 − alpha · (1 − c)` per component, and `/CA` is `1`: multiplied with the page, it looks the same. |
| `/QuadPoints` | `/Highlight` only: quadrilaterals that cover the stroke, upper edge first (start, end), then the lower edge. Preview fills each one's bounding box, so a quadrilateral covers as much of the stroke as keeps that box within 0.5 pt of it: one for a straight line across, many short ones along diagonals and curves. The stroke's ends reach about half its width further, like round caps. |
| `/BS` | `<< /W w >>`, where `w` is `baseWidth` in user space units. |
| `/F` | `4` (print the annotation). |
| `/P` | The page. |
| `/AP` | `<< /N form >>`: a form XObject that draws the stroke as described in §8. It strokes the path along the points with round caps and joins, as curves through the midpoints between points. The pen's width follows the pressure, piece by piece. The alpha is an ExtGState `/CA`, and the marker also gets `/BM /Multiply`. Points the path doesn't need, within 0.2 pt, may be left out here and in `/InkList`. |
| `/InkidianStroke` | A stream (FlateDecode) with the stroke data as JSON ([§9.3](#93-stroke-data)). |

### 9.3 Stroke data

```json
{ "formatVersion": 1, "pageToPDF": [0.48, 0, 0, -0.48, 0, 841.89], "stroke": { "id": "…", "tool": "pen", … } }
```

- `stroke` is a stroke as in [§6](#6-strokes), in *page coordinates of the PDF page*: the origin is the top-left corner of the page as it is displayed (the crop box, after `/Rotate`), y grows downward, and the scale is that of the A4 notes in §3, 1240 units per 210 mm (1240 / 595.2756 units per PDF point).
- `pageToPDF` maps these page coordinates to the PDF's default user space: `x' = a·x + c·y + e` and `y' = b·x + d·y + f` for `[a, b, c, d, e, f]`.
- A reader whose page has a different crop box or rotation than the writer's maps the points through `pageToPDF` and then into its own page coordinates.
- If another program dropped `/InkidianStroke` but kept the annotation, a reader MAY read `/InkList` as a pen stroke with pressure 0.5.

## 10. Changelog

- **v1 draft** (2026-10-06, M0): first version.
- **v1 draft** (2026-10-06, M1): rendering model calibrated against PencilKit.
  - Widths are visible widths.
  - Pen width is `baseWidth · (0.25 + 1.5·p)`, which fits PencilKit's tapering.
  - For pencil and marker, `p` sets darkness instead of width.
- **v1** (2026-10-07, M7): §9 Ink in PDF files. The `.inkd` format itself is unchanged.
- **v1** (2026-10-08): §9.2 Marker strokes in PDFs are `/Highlight` annotations with `/QuadPoints`, so Preview shows them like Obsidian does. Readers accept both subtypes.
