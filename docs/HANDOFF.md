
## TikTok 0-view glitch fix (2026-11-02, Claude)

Joyce's November PDF showed AOV TikTok videos with views gained equal to their lifetime total (182,413 = 182,413). Cause: TikTok sometimes returns view_count 0 for real, weeks-old videos; that stored 0 became the baseline. `src/lib/snapshots.ts` adds `realSnapshot()` (SQL guard: ignore 0-view rows taken more than a day after publish) used by video gains, time series, PDF daily chart, insights latest totals and the sheet feed; `isGlitchReading()` stops polling from storing new ones. Existing glitch rows stay in the database and are filtered at read time. Test: `tests/zeroViewGlitch.test.ts`. The repeated "Top videos may predate" footnote moved to the measurement notes page because it spilled onto a near-blank page. Production commit af852a0, Vercel Ready, 35 tests pass, tsc clean. Joyce only needs the monthly PDF (exported early in the following month); 3-4 h GitHub schedule gaps are acceptable for that.

## Report and dashboard design pass (2026-11-02, Claude, branch design/report-v2)

- `src/lib/monthlyPdf.ts` rewritten: dark cover with hero KPIs, KPI cards instead of metric tables, per-channel header band (avatar + platform chip), 88x50 thumbnails, "How to read this report" page. Comparison lines appear only when `comparisonReady`; "Insufficient history" text is gone. Arrows replaced by +/- because Roboto in pdfmake lacks the glyphs.
- `src/lib/pdfThumbnails.ts` also fetches channel avatars (`avatar<id>`, circular PNG) and allows `ggpht.com` / `googleusercontent.com`.
- `src/app/globals.css`: appended "Brand pass" block only (4 KPI columns, inverted hero card for Views gained, 112/128px thumbnails, firmer muted/ink-2 in dark mode, active nav inverted). No component changes.
- Preview offline: copy `scripts/_pdf_preview.ts` pattern (seed PGlite in memory, fake fetch) if you need to re-render without network. Joyce approves on the Vercel preview before merging into `claude/hello-j3im0x`.
