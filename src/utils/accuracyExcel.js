// 정확도 리포트를 Excel(.xlsx) 로 내보낸다. exceljs 로 rich text 하이라이트 지원.

const COLOR_BY_CAT = {
  typo: "FFDC2626",     // red-600
  space: "FFDC2626",
  punc: "FFDC2626",
  omission: "FFEA580C", // orange-600
  addition: "FF059669", // emerald-600
  equal: "FF111827",    // gray-900
};

function buildCellValue(opcodes, side, fallbackText) {
  // side: "ref" | "hyp"
  if (!opcodes || opcodes.length === 0) return fallbackText || "";

  const runs = [];
  for (const op of opcodes) {
    if (op.tag === "equal") {
      if (op.a) runs.push({ text: op.a, color: COLOR_BY_CAT.equal });
    } else if (op.tag === "replace") {
      const txt = side === "ref" ? op.a : op.b;
      if (txt) runs.push({ text: txt, color: COLOR_BY_CAT.typo, bold: true });
    } else if (op.tag === "delete") {
      if (side === "ref" && op.a) {
        runs.push({ text: op.a, color: COLOR_BY_CAT.omission, bold: true });
      }
    } else if (op.tag === "insert") {
      if (side === "hyp" && op.b) {
        runs.push({ text: op.b, color: COLOR_BY_CAT.addition, bold: true });
      }
    }
  }

  if (runs.length === 0) return fallbackText || "";
  if (runs.length === 1) {
    // rich text 1개 런이면 일반 문자열로 반환 (exceljs 호환성)
    return runs[0].text;
  }
  return {
    richText: runs.map((r) => ({
      text: r.text,
      font: {
        color: { argb: r.color },
        bold: !!r.bold,
        name: "Noto Sans KR",
        size: 11,
      },
    })),
  };
}

export async function downloadReportXlsx({ meta, summary, rows, labels, filename }) {
  const ExcelJSMod = await import("exceljs");
  const ExcelJS = ExcelJSMod.default || ExcelJSMod;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SoriBaro Editor";
  wb.created = new Date();

  // ===== 단일 시트 =====
  const ws = wb.addWorksheet(labels.compareSheet);
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 60;
  ws.getColumn(5).width = 15;
  ws.getColumn(6).width = 60;

  const mergeAll = (rowNum) => ws.mergeCells(rowNum, 1, rowNum, 6);

  // 라벨 A~B (2칸), 값 C~F (4칸) 로 분할 머지한 KV 행 추가
  const addMergedKV = (label, value, opts = {}) => {
    const r = ws.addRow([label, null, value, null, null, null]);
    ws.mergeCells(r.number, 1, r.number, 2);
    ws.mergeCells(r.number, 3, r.number, 6);
    const labelCell = r.getCell(1);
    const valueCell = r.getCell(3);
    labelCell.font = { bold: true, color: { argb: "FF374151" } };
    labelCell.alignment = { vertical: "middle" };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    valueCell.alignment = { vertical: "middle", wrapText: true };
    if (opts.valueFont) valueCell.font = opts.valueFont;
    // 테두리
    const border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
    labelCell.border = border;
    valueCell.border = border;
    r.height = 22;
    return r;
  };

  // 제목 / 부제 — 6열 전체 머지
  const titleRow = ws.addRow([labels.reportTitle]);
  titleRow.font = { bold: true, size: 18, color: { argb: "FF111827" } };
  titleRow.alignment = { vertical: "middle" };
  titleRow.height = 32;
  mergeAll(titleRow.number);

  const subRow = ws.addRow([meta.subTitle]);
  subRow.font = { color: { argb: "FF6B7280" }, size: 11 };
  subRow.alignment = { vertical: "middle" };
  mergeAll(subRow.number);
  ws.addRow([]);

  // 전체 정확도 (강조 카드)
  addMergedKV(labels.overallAccuracy, `${summary.accuracy.toFixed(2)}%`, {
    valueFont: { bold: true, size: 18, color: { argb: "FF4F46E5" } },
  });

  // 매치 요약 문구는 6열 전체 머지 안내 박스처럼
  const mOfRow = ws.addRow([
    labels.matchedOf
      .replace("{{matched}}", String(summary.matchedWords))
      .replace("{{total}}", String(summary.totalRefWords)),
  ]);
  mergeAll(mOfRow.number);
  mOfRow.getCell(1).font = { color: { argb: "FF6B7280" }, italic: true };
  mOfRow.getCell(1).alignment = { vertical: "middle" };
  ws.addRow([]);

  // 섹션 헤더 렌더 헬퍼 — 1~6열에만 스타일 적용 (G열 이후 색 번짐 방지)
  const addSectionHeader = (text) => {
    const r = ws.addRow([text, null, null, null, null, null]);
    r.height = 24;
    for (let c = 1; c <= 6; c++) {
      const cell = r.getCell(c);
      cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      cell.alignment = { vertical: "middle" };
    }
    mergeAll(r.number);
  };

  addSectionHeader(labels.fileInfo);
  addMergedKV(labels.refFile, meta.refName);
  addMergedKV(labels.hypFile, meta.hypName);
  addMergedKV(labels.totalWords, summary.totalRefWords);
  addMergedKV(labels.matchedWords, summary.matchedWords);
  addMergedKV(labels.editDistance, summary.editDistance);
  if (summary.speakerChanges > 0) {
    addMergedKV(labels.speakerChanges, `${summary.speakerChanges} (${labels.notReflected})`);
  }
  ws.addRow([]);

  addSectionHeader(labels.errorByType);
  addMergedKV(labels.types.typo, summary.errorCounts.typo);
  addMergedKV(labels.types.space, summary.errorCounts.space);
  addMergedKV(labels.types.punc, summary.errorCounts.punc);
  addMergedKV(labels.types.omission, summary.errorCounts.omission);
  addMergedKV(labels.types.addition, summary.errorCounts.addition);
  ws.addRow([]);
  ws.addRow([]);

  // 비교 표 헤더
  const headerRow = ws.addRow([
    labels.colNum,
    labels.colTags,
    labels.colRefTime,
    labels.colRefText,
    labels.colHypTime,
    labels.colHypText,
  ]);
  headerRow.height = 22;
  for (let c = 1; c <= 6; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, color: { argb: "FF111827" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.alignment = { vertical: "middle" };
  }
  const headerRowNumber = headerRow.number;

  // 행 종류별 셀 배경색 — AccuracyModal 정렬 그리드/표 모드와 동일한 식별 표시
  const fillSolid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const FILL_RED = fillSolid("FFFEE2E2");
  const FILL_GREEN = fillSolid("FFD1FAE5");
  const FILL_YELLOW = fillSolid("FFFEF3C7");

  // 데이터 행 (cell.value = 로 직접 할당)
  for (const r of rows) {
    const refValue = buildCellValue(r.opcodes, "ref", r.refText);
    const hypValue = buildCellValue(r.opcodes, "hyp", r.hypText);

    const row = ws.addRow([]);
    row.getCell(1).value = r.num;
    row.getCell(2).value = (r.tags || []).join(", ");
    row.getCell(3).value = r.refTime || "";
    row.getCell(4).value = refValue;
    row.getCell(5).value = r.hypTime || "";
    row.getCell(6).value = hypValue;

    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(1).alignment = { horizontal: "right", vertical: "top" };
    row.getCell(3).font = { name: "Consolas", size: 10, color: { argb: "FF374151" } };
    row.getCell(5).font = { name: "Consolas", size: 10, color: { argb: "FF374151" } };
    if (r.tags && r.tags.length > 0) {
      row.getCell(2).font = { color: { argb: "FF3730A3" }, bold: true };
    }

    if (r.kind === "delete" || r.kind === "replace") {
      row.getCell(3).fill = FILL_RED;
      row.getCell(4).fill = FILL_RED;
    }
    if (r.kind === "insert" || r.kind === "replace") {
      row.getCell(5).fill = FILL_GREEN;
      row.getCell(6).fill = FILL_GREEN;
    }
    if (r.kind === "modified") {
      row.getCell(3).fill = FILL_YELLOW;
      row.getCell(4).fill = FILL_YELLOW;
      row.getCell(5).fill = FILL_YELLOW;
      row.getCell(6).fill = FILL_YELLOW;
    }
  }

  // 비교 표 범위에만 테두리
  const lastRow = ws.lastRow ? ws.lastRow.number : headerRowNumber;
  for (let rn = headerRowNumber; rn <= lastRow; rn++) {
    const row = ws.getRow(rn);
    for (let cn = 1; cn <= 6; cn++) {
      row.getCell(cn).border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
