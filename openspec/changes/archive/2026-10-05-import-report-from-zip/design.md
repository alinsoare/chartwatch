## Context

`parseReportFile(arrayBuffer)` in `web/reports/parse.js` unzips with `unzipXlsx` (a minimal reader returning a `Map<name, Uint8Array>` of every entry, names normalised to `/`), reads the sheets, and parses them. `app.js` rejects any file name not ending in `.xlsx`, and `index.html` limits the picker with `accept`. An `.xlsx` is itself a ZIP, so an archive wrapping a report is a ZIP whose entries include another ZIP. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Accept a `.zip` that wraps exactly one `.xlsx`, at any folder depth, with no new dependency.
- Keep every existing failure path and cached-state guarantee unchanged.

**Non-Goals:**
- Choosing among, or merging, several reports in one archive.
- Nested archives beyond one level (zip inside zip inside zip), password-protected or ZIP64 archives, other formats (`.rar`, `.7z`, `.tar`).

## Decisions

**1. Unwrap inside `parseReportFile`, detected by content, not by file name.**
After `unzipXlsx`, a real workbook has `xl/workbook.xml`. If that entry is absent, look for `.xlsx` entries; if exactly one, run `unzipXlsx` again on its bytes and continue with the existing sheet reading. Detecting by content means a renamed file works either way and `app.js` only needs a looser name check. Alternative: branch on the `.zip` extension in `app.js`; rejected because it splits parsing logic across two modules and misses misnamed files.

**2. Reuse `unzipXlsx` unchanged.**
It already returns all entries decompressed, including the inner workbook as bytes, so no ZIP-reader changes are needed. Cost: other entries in the archive are inflated too; acceptable for small report archives.

**3. Entry filtering rules.**
An entry counts as a report when its normalised name ends in `.xlsx` (case-insensitive), is not a directory (trailing `/`), has no path segment equal to `__MACOSX`, and its base name does not start with `._` or `~$` (Office lock files). The `.xlsx` check uses the entry name only, never its contents.

**4. Multiple or zero reports are errors, reported through the existing `{ ok: false, error }` result shape.**
The messages name the case ("no .xlsx report found in the archive" / "expected exactly one .xlsx, found: a.xlsx, b.xlsx"). This keeps `app.js` handling and the replace-without-merge rule untouched; the user picks one explicitly by re-zipping or importing the file directly.

**5. `app.js` accepts `.xlsx` and `.zip` names; `index.html` `accept` adds `.zip` and `application/zip`.**
The rejection message becomes "Please choose an .xlsx or .zip file."

## Risks / Trade-offs

- [A ZIP that is neither a workbook nor an archive of one gives a confusing error] → Fall through to the existing "not a recognized XTB report" message when there is no `xl/workbook.xml` and no `.xlsx` entry.
- [Large archives inflate unrelated entries in memory] → Reports are small; revisit only if it proves slow.
- [Unsupported compression methods in an outer archive] → Surfaces the existing "Unsupported compression method" error, reported as a failed import without touching cache.
- [Name-based junk filtering misses an unusual archiver artefact] → Rules are narrow and conservative; anything else counts as a report and fails visibly if it is not one.
