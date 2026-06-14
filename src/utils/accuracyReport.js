// Python accuracy_tool 과 동일한 HTML 리포트를 만들고 html2pdf.js 로 PDF 저장한다.

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A4 landscape 기준 내부 작업 폭 (297mm - 좌우 마진 10mm 씩 = 277mm).
// html2canvas 는 px 단위로 캡쳐하므로 mm 단위를 px 로 환산 (96dpi: 1mm ≈ 3.7795px).
// 277mm ≈ 1047px. 여유 두고 1040px 로 고정.
const REPORT_CSS = `
  :root {
    --bg-body: #ffffff;
    --bg-card: #ffffff;
    --border-subtle: #d1d5db;
    --text-main: #111827;
    --text-sub: #6b7280;
    --accent: #4f46e5;
  }
  * { box-sizing: border-box; }
  .sr-report-root {
    font-family: system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo",
                 "Malgun Gothic", "Noto Sans KR", sans-serif;
    font-size: 11px;
    line-height: 1.45;
    padding: 0;
    margin: 0;
    background-color: var(--bg-body);
    color: var(--text-main);
    width: 1040px;
  }
  .sr-report-root h1 { font-size: 18px; margin: 0 0 4px 0; }
  .sr-report-root .sub-title { font-size: 11px; color: var(--text-sub); margin-bottom: 12px; }
  .sr-report-root .accuracy-banner {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 8px 14px; border-radius: 10px; background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    margin-bottom: 12px;
  }
  .sr-report-root .accuracy-score { font-size: 12px; color: var(--text-sub); }
  .sr-report-root .accuracy-score span { font-size: 22px; font-weight: 700; color: var(--accent); }
  .sr-report-root .accuracy-meta { font-size: 11px; color: var(--text-sub); }
  .sr-report-root .summary-container { display: flex; flex-wrap: nowrap; gap: 12px; margin-bottom: 14px; }
  .sr-report-root .card {
    background: var(--bg-card); border-radius: 8px; padding: 10px 12px;
    border: 1px solid var(--border-subtle); flex: 1 1 0; min-width: 0;
  }
  .sr-report-root .card-title {
    font-size: 12px; font-weight: 700; margin-bottom: 6px;
    color: #ffffff; background: var(--accent);
    padding: 4px 8px; border-radius: 4px; margin: -10px -12px 8px;
  }
  .sr-report-root .card table { width: 100%; border-collapse: collapse; }
  .sr-report-root .card th, .sr-report-root .card td {
    border: none; padding: 3px 0; font-size: 11px; vertical-align: top;
  }
  .sr-report-root .card th { width: 46%; text-align: left; color: var(--text-sub); font-weight: 500; }
  .sr-report-root .section-title { margin-top: 6px; margin-bottom: 4px; font-size: 13px; font-weight: 700; }
  .sr-report-root .hint { font-size: 10px; color: var(--text-sub); margin-bottom: 6px; }
  .sr-report-root table.main-table {
    border-collapse: collapse; width: 100%; table-layout: fixed; word-break: break-word;
    background: var(--bg-card);
  }
  .sr-report-root table.main-table thead { display: table-header-group; }
  .sr-report-root table.main-table tr { page-break-inside: avoid; }
  .sr-report-root th, .sr-report-root td {
    border: 1px solid var(--border-subtle); padding: 4px 6px; vertical-align: top;
  }
  .sr-report-root th { font-weight: 700; font-size: 11px; background: #e5e7eb; color: #111827; }
  .sr-report-root .center { text-align: center; }
  .sr-report-root .line-no { background-color: #f9fafb; color: #374151; font-size: 10px; font-weight: 600; }
  .sr-report-root .text-cell { white-space: pre-wrap; font-size: 11px; }
  .sr-report-root .time-cell { white-space: pre-line; font-family: "Consolas", "Menlo", monospace; font-size: 10px; color: #374151; line-height: 1.3; }
  .sr-report-root .err-typo, .sr-report-root .err-space, .sr-report-root .err-punc {
    background-color: rgba(248, 113, 113, 0.25);
  }
  .sr-report-root .err-omission { background-color: rgba(251, 146, 60, 0.25); }
  .sr-report-root .err-addition { background-color: rgba(52, 211, 153, 0.25); }
  /* 행 종류별 셀 배경 — AccuracyModal 정렬 그리드/표 모드와 동일한 식별 표시 */
  .sr-report-root tr.row-delete td.t-orig { background-color: #fee2e2; }
  .sr-report-root tr.row-insert td.t-curr { background-color: #d1fae5; }
  .sr-report-root tr.row-replace td.t-orig { background-color: #fee2e2; }
  .sr-report-root tr.row-replace td.t-curr { background-color: #d1fae5; }
  .sr-report-root tr.row-modified td.t-orig,
  .sr-report-root tr.row-modified td.t-curr { background-color: #fef3c7; }
  .sr-report-root .row-tags {
    display: inline-flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;
  }
  .sr-report-root .row-tag {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    background: #4f46e5;
    color: #ffffff;
    border: 1px solid #3730a3;
    font-weight: 600;
  }
`;

// data: {
//   meta: { refName, hypName, title, subTitle },
//   accuracy, totalRefWords, matchedWords, editDistance,
//   errorCounts: {typo, space, punc, omission, addition},
//   speakerChanges,
//   rows: [{ num, refTime, refHtml, hypTime, hypHtml }],
//   i18n: { labels... }
// }
export function buildReportHTML(data) {
  const { meta, accuracy, totalRefWords, matchedWords, editDistance,
    errorCounts, speakerChanges, rows, i18n } = data;

  const renderTags = (tags) => {
    if (!tags || !tags.length) return "";
    const pills = tags
      .map((name) => `<span class="row-tag">${escapeHtml(name)}</span>`)
      .join("");
    return `<div class="row-tags">${pills}</div>`;
  };

  const rowHtml = rows.map((r) => {
    const trClass = r.kind && r.kind !== "equal" ? ` class="row-${r.kind}"` : "";
    return (
      `<tr${trClass}>
         <td class="center line-no">${r.num}</td>
         <td class="time-cell t-orig">${escapeHtml(r.refTime || "")}</td>
         <td class="text-cell t-orig">${renderTags(r.tags)}${r.refHtml || ""}</td>
         <td class="time-cell t-curr">${escapeHtml(r.hypTime || "")}</td>
         <td class="text-cell t-curr">${r.hypHtml || ""}</td>
       </tr>`
    );
  }).join("");

  const speakerLine = speakerChanges > 0
    ? `<br>${escapeHtml(i18n.speakerChanges)}: ${speakerChanges} (${escapeHtml(i18n.notReflected)})`
    : "";

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(meta.title)}</title>
<style>${REPORT_CSS}</style></head><body>
<div class="sr-report-root">
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="sub-title">${escapeHtml(meta.subTitle)}</div>

  <div class="accuracy-banner">
    <div class="accuracy-score">${escapeHtml(i18n.overallAccuracy)}&nbsp;<span>${accuracy.toFixed(2)}%</span></div>
    <div class="accuracy-meta">
      ${escapeHtml(i18n.matchedOf
        .replace("{{matched}}", String(matchedWords))
        .replace("{{total}}", String(totalRefWords)))}
      ${speakerLine}
    </div>
  </div>

  <div class="summary-container">
    <div class="card">
      <div class="card-title">${escapeHtml(i18n.fileInfo)}</div>
      <table>
        <tr><th>${escapeHtml(i18n.refFile)}</th><td>${escapeHtml(meta.refName)}</td></tr>
        <tr><th>${escapeHtml(i18n.hypFile)}</th><td>${escapeHtml(meta.hypName)}</td></tr>
        <tr><th>${escapeHtml(i18n.totalWords)}</th><td>${totalRefWords}</td></tr>
        <tr><th>${escapeHtml(i18n.matchedWords)}</th><td>${matchedWords}</td></tr>
        <tr><th>${escapeHtml(i18n.editDistance)}</th><td>${editDistance}</td></tr>
      </table>
    </div>
    <div class="card">
      <div class="card-title">${escapeHtml(i18n.errorByType)}</div>
      <table>
        <tr><th>${escapeHtml(i18n.types.typo)}</th><td>${errorCounts.typo}</td></tr>
        <tr><th>${escapeHtml(i18n.types.space)}</th><td>${errorCounts.space}</td></tr>
        <tr><th>${escapeHtml(i18n.types.punc)}</th><td>${errorCounts.punc}</td></tr>
        <tr><th>${escapeHtml(i18n.types.omission)}</th><td>${errorCounts.omission}</td></tr>
        <tr><th>${escapeHtml(i18n.types.addition)}</th><td>${errorCounts.addition}</td></tr>
      </table>
    </div>
  </div>

  <div class="section-title">${escapeHtml(i18n.lineCompare)}</div>
  <div class="hint">${escapeHtml(i18n.hint)}</div>

  <table class="main-table">
    <thead>
      <tr>
        <th style="width:36px;">${escapeHtml(i18n.colNum)}</th>
        <th style="width:100px;">${escapeHtml(i18n.colRefTime)}</th>
        <th>${escapeHtml(i18n.colRefText)}</th>
        <th style="width:100px;">${escapeHtml(i18n.colHypTime)}</th>
        <th>${escapeHtml(i18n.colHypText)}</th>
      </tr>
    </thead>
    <tbody>${rowHtml}</tbody>
  </table>
</div>
</body></html>`;
}

// 숨겨진 컨테이너에 리포트를 렌더하고 html2pdf.js 로 저장한다.
export async function downloadReportPdf({ html, filename }) {
  const html2pdfMod = await import("html2pdf.js");
  const html2pdf = html2pdfMod.default || html2pdfMod;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);

  const target = container.querySelector(".sr-report-root") || container;

  try {
    await html2pdf()
      .from(target)
      .set({
        margin: [10, 10, 10, 10], // mm
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 1040,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy", "avoid-all"] },
      })
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
