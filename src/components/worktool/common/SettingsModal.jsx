import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useSettingsStore,
  FRAMERATE_OPTIONS,
} from "../../../stores/settingsStore";
import { CHAR_COUNT_PRESETS } from "../../../utils/cpsUtils";
import { usePerformanceStore } from "../../../stores/performanceStore";
import {
  useShortcutsStore,
  isMac,
  getKeyDisplayName as getKeyDisplay,
  getModifierDisplayName,
} from "../../../stores/shortcutsStore";
import { useAIStore } from "../../../stores/aiStore";
import {
  useWaveformColorStore,
  COLOR_LABEL_KEYS,
  COLOR_PRESETS,
  SAMPLES_PER_PIXEL_OPTIONS,
  WAVEFORM_RENDER_MODES,
} from "../../../stores/waveformColorStore";
import {
  getAvailableLLMProviders,
  getAvailableSTTProviders,
} from "../../../services/ai";
import { mapSTTErrorMessage } from "../../../services/ai/stt/sttErrorMapper";
import { useSubtitleStore } from "../../../stores/subtitleStore";
import "./SettingsModal.css";

// 키보드 이벤트에서 키 표시 이름으로 변환 (캡처용)
const getKeyDisplayName = (key) => {
  const keyMap = {
    Control: isMac ? "⌃" : "Ctrl",
    Meta: "⌘",
    Alt: isMac ? "⌥" : "Alt",
    Shift: "Shift",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    " ": "Space",
    Escape: "Esc",
    Backspace: "Backspace",
    Enter: "Enter",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    Delete: "Delete",
  };
  return keyMap[key] || key.toUpperCase();
};

const TABS = [
  { id: "general", label: "일반", icon: "⚙️" },
  { id: "subtitleEditor", label: "자막편집", icon: "📝" },
  { id: "waveform", label: "파형", icon: "🌊" },
  { id: "shortcuts", label: "단축키", icon: "⌨️" },
  { id: "performance", label: "성능", icon: "🚀" },
  // { id: "ai", label: "AI", icon: "🤖" },
];


export default function SettingsModal({ isOpen, onClose }) {
  const { t } = useTranslation("worktool");
  const [activeTab, setActiveTab] = useState("general");

  // 단축키 편집 모달 상태
  const [editingShortcut, setEditingShortcut] = useState(null); // { id, action, displayKeys, displayKeys2, category }
  const [editingSlot, setEditingSlot] = useState("main"); // 'main' | 'sub'
  const [mainCapture, setMainCapture] = useState({ keys: [], modifiers: [], key: null, changed: false });
  const [subCapture, setSubCapture] = useState({ keys: [], modifiers: [], key: null, changed: false });
  const [duplicateWarning, setDuplicateWarning] = useState(null); // 중복 경고

  // 단축키 설정
  const shortcuts = useShortcutsStore((state) => state.shortcuts);
  const getShortcutsList = useShortcutsStore((state) => state.getShortcutsList);
  const updateShortcut = useShortcutsStore((state) => state.updateShortcut);
  const resetShortcut = useShortcutsStore((state) => state.resetShortcut);
  const resetAllShortcuts = useShortcutsStore(
    (state) => state.resetAllShortcuts,
  );
  const checkDuplicate = useShortcutsStore((state) => state.checkDuplicate);
  const clearSubShortcut = useShortcutsStore((state) => state.clearSubShortcut);
  const getDefaultShortcut = useShortcutsStore(
    (state) => state.getDefaultShortcut,
  );

  // 일반 설정
  const general = useSettingsStore((state) => state.general);
  const updateGeneral = useSettingsStore((state) => state.updateGeneral);
  const resetGeneral = useSettingsStore((state) => state.resetGeneral);

  // 자막 편집 설정
  const subtitleEditor = useSettingsStore((state) => state.subtitleEditor);
  const updateSubtitleEditor = useSettingsStore(
    (state) => state.updateSubtitleEditor,
  );
  const resetSubtitleEditor = useSettingsStore(
    (state) => state.resetSubtitleEditor,
  );

  // 파형 설정
  const waveformColors = useWaveformColorStore((state) => state.colors);
  const waveformSettings = useWaveformColorStore((state) => state.settings);
  const currentPreset = useWaveformColorStore((state) => state.currentPreset);
  const setWaveformColor = useWaveformColorStore((state) => state.setColor);
  const setSamplesPerPixel = useWaveformColorStore(
    (state) => state.setSamplesPerPixel,
  );
  const setRenderMode = useWaveformColorStore((state) => state.setRenderMode);
  const setLineWidth = useWaveformColorStore((state) => state.setLineWidth);
  const applyWaveformPreset = useWaveformColorStore(
    (state) => state.applyPreset,
  );
  const resetWaveformToDefault = useWaveformColorStore(
    (state) => state.resetToDefault,
  );

  // AI 설정 (새로운 aiStore 사용)
  const llmConfig = useAIStore((state) => state.llm);
  const sttConfig = useAIStore((state) => state.stt);
  const setLLMConfig = useAIStore((state) => state.setLLMConfig);
  const setLLMApiKey = useAIStore((state) => state.setLLMApiKey);
  const setSTTProvider = useAIStore((state) => state.setSTTProvider);
  const setSTTCredential = useAIStore((state) => state.setSTTCredential);
  const setSTTProviderSetting = useAIStore(
    (state) => state.setSTTProviderSetting,
  );
  const setSTTSegmentOption = useAIStore((state) => state.setSTTSegmentOption);
  const testLLMConnection = useAIStore((state) => state.testLLMConnection);
  const testSTTConnection = useAIStore((state) => state.testSTTConnection);
  const translateSubtitles = useAIStore((state) => state.translateSubtitles);
  const transcribeAudio = useAIStore((state) => state.transcribeAudio);
  const isLLMConnected = useAIStore((state) => state.isLLMConnected);
  const isSTTConnected = useAIStore((state) => state.isSTTConnected);
  const lastLLMTestResult = useAIStore((state) => state.lastLLMTestResult);
  const lastSTTTestResult = useAIStore((state) => state.lastSTTTestResult);
  const resetAllAISettings = useAIStore((state) => state.resetAllSettings);

  // 성능 설정
  const hardware = usePerformanceStore((state) => state.hardware);
  const perfSettings = usePerformanceStore((state) => state.settings);
  const initHardware = usePerformanceStore((state) => state.initHardware);
  const updatePerfSettings = usePerformanceStore(
    (state) => state.updateSettings,
  );
  const applyPreset = usePerformanceStore((state) => state.applyPreset);

  // API 키 표시 상태 (동적으로 관리)
  const [showKeys, setShowKeys] = useState({
    llmApiKey: false,
    // STT credentials는 동적으로 추가됨
  });

  // AI 연결 테스트 로딩 상태
  const [isTestingLLM, setIsTestingLLM] = useState(false);
  const [isTestingSTT, setIsTestingSTT] = useState(false);

  // AI 기능 테스트 상태
  const [isTranslationTesting, setIsTranslationTesting] = useState(false);
  const [translationTestResult, setTranslationTestResult] = useState(null);
  const [isSTTTesting, setIsSTTTesting] = useState(false);
  const [sttTestResult, setSTTTestResult] = useState(null);

  // AI 탭 섹션 접기 상태
  const [collapsedSections, setCollapsedSections] = useState({
    llm: false,
    stt: false,
    functionTest: false,
  });

  // 컴포넌트 마운트 시 하드웨어 정보 초기화
  useEffect(() => {
    if (isOpen && !hardware) {
      initHardware();
    }
  }, [isOpen, hardware, initHardware]);

  // 단축키 편집 모달에서 키 입력 감지
  const handleKeyCapture = useCallback(
    (e) => {
      if (!editingShortcut) return;

      e.preventDefault();
      e.stopPropagation();

      const displayModifiers = [];
      const storeModifiers = [];

      if (e.ctrlKey) {
        displayModifiers.push(getKeyDisplayName("Control"));
        storeModifiers.push("ctrl");
      }
      if (e.metaKey) {
        displayModifiers.push(getKeyDisplayName("Meta"));
        storeModifiers.push("meta");
      }
      if (e.altKey) {
        displayModifiers.push(getKeyDisplayName("Alt"));
        storeModifiers.push("alt");
      }
      if (e.shiftKey) {
        displayModifiers.push(getKeyDisplayName("Shift"));
        storeModifiers.push("shift");
      }

      const isOnlyModifier = ["Control", "Meta", "Alt", "Shift"].includes(
        e.key,
      );

      const setCapture = editingSlot === "main" ? setMainCapture : setSubCapture;

      if (isOnlyModifier) {
        setCapture({ keys: displayModifiers, modifiers: storeModifiers, key: null, changed: true });
        setDuplicateWarning(null);
      } else {
        const displayKey = getKeyDisplayName(e.key);
        setCapture({
          keys: [...displayModifiers, displayKey],
          modifiers: storeModifiers,
          key: e.key,
          changed: true,
        });

        const { isDuplicate, conflictWith } = checkDuplicate(
          storeModifiers,
          e.key,
          editingShortcut.id,
          editingSlot,
        );
        if (isDuplicate) {
          setDuplicateWarning(
            t("settings.shortcuts.conflictWarning", { conflictWith }),
          );
        } else {
          setDuplicateWarning(null);
        }
      }
    },
    [editingShortcut, editingSlot, checkDuplicate, t],
  );

  // 단축키 편집 모달 열릴 때 이벤트 리스너 등록
  useEffect(() => {
    if (editingShortcut) {
      window.addEventListener("keydown", handleKeyCapture);
      return () => window.removeEventListener("keydown", handleKeyCapture);
    }
  }, [editingShortcut, handleKeyCapture]);

  if (!isOpen) return null;

  const toggleKeyVisibility = (provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  // 프리셋 옵션 목록
  const charCountPresetOptions = [
    { value: CHAR_COUNT_PRESETS.simple, label: t("settings.general.presetSimple") },
    { value: CHAR_COUNT_PRESETS.simpleWithSpaces, label: t("settings.general.presetSimpleWithSpaces") },
    { value: CHAR_COUNT_PRESETS.cjkWeighted, label: t("settings.general.presetCjkWeighted") },
    { value: CHAR_COUNT_PRESETS.cjkWeightedWithSpaces, label: t("settings.general.presetCjkWeightedWithSpaces") },
  ];

  // 일반 설정 탭
  const renderGeneralTab = () => (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3>📝 자막 속도 제한</h3>

        <div className="setting-row">
          <label>
            <span className="setting-label">Char Count Preset</span>
            <span className="setting-hint">{t("settings.general.charCountPreset")}</span>
          </label>
          <select
            value={general.charCountPreset}
            onChange={(e) =>
              updateGeneral({ charCountPreset: e.target.value })
            }
          >
            {charCountPresetOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Max Characters / sec</span>
            <span className="setting-hint">{t("settings.general.maxCps")}</span>
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={general.maxCharactersPerSec}
            onChange={(e) =>
              updateGeneral({
                maxCharactersPerSec: parseInt(e.target.value) || 21,
              })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Max Words / min</span>
            <span className="setting-hint">{t("settings.general.maxWpm")}</span>
          </label>
          <input
            type="number"
            min="50"
            max="300"
            value={general.maxWordsPerMin}
            onChange={(e) =>
              updateGeneral({ maxWordsPerMin: parseInt(e.target.value) || 160 })
            }
          />
        </div>
      </div>

      <div className="settings-section">
        <h3>⏱️ 자막 시간 설정</h3>

        <div className="setting-row">
          <label>
            <span className="setting-label">Min Duration (ms)</span>
            <span className="setting-hint">
              {t("settings.general.minDuration")}
            </span>
          </label>
          <input
            type="number"
            min="100"
            max="5000"
            step="100"
            value={general.minDurationMs}
            onChange={(e) =>
              updateGeneral({ minDurationMs: parseInt(e.target.value) || 833 })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Max Duration (ms)</span>
            <span className="setting-hint">
              {t("settings.general.maxDuration")}
            </span>
          </label>
          <input
            type="number"
            min="1000"
            max="30000"
            step="100"
            value={general.maxDurationMs}
            onChange={(e) =>
              updateGeneral({ maxDurationMs: parseInt(e.target.value) || 7000 })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Min Gap (ms)</span>
            <span className="setting-hint">{t("settings.general.minGap")}</span>
          </label>
          <input
            type="number"
            min="0"
            max="1000"
            step="1"
            value={general.minGapMs}
            onChange={(e) =>
              { const v = parseInt(e.target.value); updateGeneral({ minGapMs: isNaN(v) ? 80 : v }); }
            }
          />
        </div>
      </div>

      <div className="settings-section">
        <h3>📐 자막 형식</h3>

        <div className="setting-row">
          <label>
            <span className="setting-label">Max Number of Lines</span>
            <span className="setting-hint">
              {t("settings.general.maxLines")}
            </span>
          </label>
          <input
            type="number"
            min="1"
            max="4"
            value={general.maxNumberOfLines}
            onChange={(e) =>
              updateGeneral({ maxNumberOfLines: parseInt(e.target.value) || 2 })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Max Line Length</span>
            <span className="setting-hint">
              {t("settings.general.maxLineLength")}
            </span>
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={general.maxLineLength}
            onChange={(e) =>
              updateGeneral({ maxLineLength: parseInt(e.target.value) || 16 })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">Default Framerate</span>
            <span className="setting-hint">
              {t("settings.general.defaultFramerate")}
            </span>
          </label>
          <select
            value={general.defaultFramerate}
            onChange={(e) =>
              updateGeneral({ defaultFramerate: parseFloat(e.target.value) })
            }
          >
            {FRAMERATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn-reset" onClick={resetGeneral}>
          🔄 {t("settings.general.resetToDefault")}
        </button>
      </div>
    </div>
  );

  // 파형 설정 탭
  const renderWaveformTab = () => {
    // 색상 입력 처리 (rgba 색상은 hex로 변환)
    const getHexFromColor = (color) => {
      if (!color) return "#000000";
      if (color.startsWith("#")) return color.substring(0, 7);
      // rgba에서 hex 추출 시도
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      return "#000000";
    };

    // hex를 rgba로 변환 (투명도 있는 색상용)
    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // 색상 그룹 정의
    const colorGroups = [
      {
        title: t("settings.waveform.waveformColor"),
        items: [
          { key: "waveformColor", hasAlpha: false },
          { key: "playedWaveformColor", hasAlpha: false },
        ],
      },
      {
        title: t("settings.waveform.segmentColor"),
        items: [
          { key: "segmentOverlayColor", hasAlpha: true, alpha: 0.25 },
          { key: "segmentSelectedColor", hasAlpha: true, alpha: 0.4 },
          { key: "segmentContextTargetColor", hasAlpha: true, alpha: 0.6 },
          { key: "segmentStartMarker", hasAlpha: false },
          { key: "segmentEndMarker", hasAlpha: false },
        ],
      },
      {
        title: t("settings.waveform.otherColor"),
        items: [
          { key: "sceneMarkerColor", hasAlpha: false },
          { key: "axisLabelColor", hasAlpha: false },
          { key: "axisGridlineColor", hasAlpha: false },
        ],
      },
    ];

    return (
      <div className="settings-tab-content">
        {/* 샘플 크기 설정 */}
        <div className="settings-section">
          <h3>📊 {t("settings.waveform.qualityTitle")}</h3>

          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.waveform.samplesPerPixel")}
              </span>
              <span className="setting-hint">
                {t("settings.waveform.samplesPerPixelDesc")}
              </span>
            </label>
            <select
              value={waveformSettings?.samplesPerPixel || 64}
              onChange={(e) => setSamplesPerPixel(parseInt(e.target.value))}
            >
              {SAMPLES_PER_PIXEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-hint-box">
            {
              (() => {
                const opt = SAMPLES_PER_PIXEL_OPTIONS.find(
                  (o) => o.value === (waveformSettings?.samplesPerPixel || 64),
                );
                return opt ? t(opt.descKey) : '';
              })()
            }
          </div>
        </div>

        {/* 파형 스타일 */}
        <div className="settings-section">
          <h3>〰️ {t("settings.waveform.styleTitle")}</h3>

          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.waveform.renderingMode")}
              </span>
              <span className="setting-hint">
                {t("settings.waveform.renderingModeDesc")}
              </span>
            </label>
            <div className="render-mode-selector">
              {WAVEFORM_RENDER_MODES.map((mode) => (
                <button
                  key={mode.value}
                  className={`render-mode-btn ${waveformSettings?.renderMode === mode.value ? "active" : ""}`}
                  onClick={() => setRenderMode(mode.value)}
                  title={t(mode.descKey)}
                >
                  {mode.value === "bar" ? "▮▮▮" : "〰️"} {t(mode.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {waveformSettings?.renderMode === "line" && (
            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.waveform.lineWidth")}
                </span>
                <span className="setting-hint">
                  {waveformSettings?.lineWidth || 1.5}px
                </span>
              </label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.5"
                value={waveformSettings?.lineWidth || 1.5}
                onChange={(e) => setLineWidth(parseFloat(e.target.value))}
                className="line-width-slider"
              />
            </div>
          )}
        </div>

        {/* 색상 프리셋 */}
        <div className="settings-section">
          <h3>🎨 {t("settings.waveform.colorPreset")}</h3>
          <div className="preset-grid waveform-presets">
            {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                className={`preset-btn ${currentPreset === key ? "active" : ""}`}
                onClick={() => applyWaveformPreset(key)}
              >
                <span className="preset-label">
                  {preset.icon} {t(preset.nameKey)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 색상 설정 */}
        <div className="settings-section">
          <h3>🖌️ {t("settings.waveform.customColors")}</h3>

          {colorGroups.map((group) => (
            <div key={group.title} className="color-group">
              <h4>{group.title}</h4>
              <div className="color-grid">
                {group.items.map((item) => (
                  <div key={item.key} className="color-item">
                    <label>{t(COLOR_LABEL_KEYS[item.key])}</label>
                    <div className="color-input-wrapper">
                      <input
                        type="color"
                        value={getHexFromColor(waveformColors[item.key])}
                        onChange={(e) => {
                          const newColor = item.hasAlpha
                            ? hexToRgba(e.target.value, item.alpha)
                            : e.target.value;
                          setWaveformColor(item.key, newColor);
                        }}
                      />
                      <span
                        className="color-preview"
                        style={{ background: waveformColors[item.key] }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="settings-actions">
          <button className="btn-reset" onClick={resetWaveformToDefault}>
            🔄 {t("settings.general.resetToDefault")}
          </button>
        </div>
      </div>
    );
  };

  // 자막 편집 설정 탭
  const renderSubtitleEditorTab = () => (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3>🔤 {t("settings.subtitleEditor.fontSettings")}</h3>

        <div className="setting-row">
          <label>
            <span className="setting-label">
              {t("settings.subtitleEditor.fontSize")}
            </span>
            <span className="setting-hint">
              {t("settings.subtitleEditor.fontSizeDesc")}
            </span>
          </label>
          <input
            type="number"
            min="10"
            max="24"
            value={subtitleEditor?.fontSize || 13}
            onChange={(e) =>
              updateSubtitleEditor({ fontSize: parseInt(e.target.value) || 13 })
            }
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">
              {t("settings.subtitleEditor.guidelineBase")}
            </span>
            <span className="setting-hint">
              {t("settings.subtitleEditor.guidelineBaseDesc")}
            </span>
          </label>
          <select
            value={subtitleEditor?.guidelineBase || "cjk"}
            onChange={(e) =>
              updateSubtitleEditor({ guidelineBase: e.target.value })
            }
          >
            <option value="cjk">
              {t("settings.subtitleEditor.guidelineBaseCjk")}
            </option>
            <option value="ascii">
              {t("settings.subtitleEditor.guidelineBaseAscii")}
            </option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h3>📏 {t("settings.subtitleEditor.guideline")}</h3>

        <div className="setting-row">
          <label>
            <span className="setting-label">
              {t("settings.subtitleEditor.guidelinePosition")}
            </span>
            <span className="setting-hint">
              {t("settings.subtitleEditor.guidelineDisableHint")}
            </span>
          </label>
          <input
            type="number"
            min="0"
            max="200"
            value={sttConfig.segmentOptions?.maxSegmentLength ?? 80}
            onChange={(e) => {
              const val = e.target.value;
              setSTTSegmentOption(
                "maxSegmentLength",
                val === "" ? "" : parseInt(val),
              );
            }}
            onBlur={(e) => {
              const val = parseInt(e.target.value);
              if (!val || isNaN(val))
                setSTTSegmentOption("maxSegmentLength", 0);
            }}
          />
        </div>

        <div className="setting-row">
          <label>
            <span className="setting-label">
              {t("settings.subtitleEditor.guidelineColor")}
            </span>
          </label>
          <div className="color-input-wrapper">
            <input
              type="color"
              value={
                subtitleEditor?.guidelineColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ||
                "#ff6464"
              }
              onChange={(e) =>
                updateSubtitleEditor({ guidelineColor: `${e.target.value}66` })
              }
            />
            <span
              className="color-preview"
              style={{
                background:
                  subtitleEditor?.guidelineColor || "rgba(255, 100, 100, 0.4)",
              }}
            ></span>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>👁️ {t("settings.subtitleEditor.preview")}</h3>
        <div
          className="subtitle-preview"
          style={{
            fontFamily: "'Noto Sans Mono', 'JetBrains Mono', monospace",
            fontSize: `${subtitleEditor?.fontSize || 13}px`,
            background: "var(--surface-dark)",
            padding: "12px",
            borderRadius: "6px",
            position: "relative",
            lineHeight: "1.5",
          }}
        >
          <span>{t("settings.subtitleEditor.previewText")}</span>
          {(sttConfig.segmentOptions?.maxSegmentLength || 80) > 0 && (
            <div
              style={{
                position: "absolute",
                left: `calc(12px + ${sttConfig.segmentOptions?.maxSegmentLength || 80}ch)`,
                top: 0,
                bottom: 0,
                width: "1px",
                background:
                  subtitleEditor?.guidelineColor || "rgba(255, 100, 100, 0.4)",
              }}
            />
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn-reset" onClick={resetSubtitleEditor}>
          🔄 {t("settings.general.resetToDefault")}
        </button>
      </div>
    </div>
  );

  // 성능 설정 탭
  const renderPerformanceTab = () => {
    const presetOptions = [
      {
        value: "auto",
        label: `🔄 ${t("settings.performance.presetAuto")}`,
        desc: t("settings.performance.autoDetect"),
      },
      {
        value: "high",
        label: `🚀 ${t("settings.performance.presetHigh")}`,
        desc: t("settings.performance.highEnd"),
      },
      {
        value: "balanced",
        label: `⚖️ ${t("settings.performance.presetBalanced")}`,
        desc: t("settings.performance.balanced"),
      },
      {
        value: "performance",
        label: `⚡ ${t("settings.performance.presetPerformance")}`,
        desc: t("settings.performance.lowEnd"),
      },
    ];

    const qualityOptions = [
      { value: "low", label: t("settings.performance.qualityLow") },
      { value: "medium", label: t("settings.performance.qualityMedium") },
      { value: "high", label: t("settings.performance.qualityHigh") },
    ];

    return (
      <div className="settings-tab-content">
        {/* 하드웨어 정보 */}
        {hardware && (
          <div className="settings-section hardware-section">
            <h3>🖥️ {t("settings.performance.detectedHardware")}</h3>
            <div className="hardware-grid">
              <div className="hw-item">
                <span className="hw-label">CPU</span>
                <span className="hw-value">{hardware.cpuCores} {t("settings.performance.cores")}</span>
              </div>
              <div className="hw-item">
                <span className="hw-label">{t("settings.performance.memory")}</span>
                <span className="hw-value">
                  {hardware.deviceMemory || "?"} GB
                </span>
              </div>
              <div className="hw-item">
                <span className="hw-label">GPU</span>
                <span
                  className="hw-value"
                  title={hardware.gpu?.renderer || "알 수 없음"}
                >
                  {hardware.gpu?.renderer?.substring(0, 20) || "알 수 없음"}
                  {hardware.gpu?.renderer?.length > 20 ? "..." : ""}
                </span>
              </div>
              <div className="hw-item">
                <span className="hw-label">WebGL</span>
                <span
                  className={`hw-value ${hardware.webgl2Supported ? "supported" : ""}`}
                >
                  {hardware.webgl2Supported
                    ? "WebGL 2"
                    : hardware.webglSupported
                      ? "WebGL 1"
                      : "미지원"}
                </span>
              </div>
            </div>
            <div className="feature-badges">
              <span
                className={`badge ${hardware.webWorkerSupported ? "active" : ""}`}
              >
                {hardware.webWorkerSupported ? "✓" : "✗"} Web Workers
              </span>
              <span
                className={`badge ${hardware.offscreenCanvasSupported ? "active" : ""}`}
              >
                {hardware.offscreenCanvasSupported ? "✓" : "✗"} OffscreenCanvas
              </span>
            </div>
          </div>
        )}

        {/* 프리셋 */}
        <div className="settings-section">
          <h3>🎯 {t("settings.performance.presetTitle")}</h3>
          <div className="preset-grid">
            {presetOptions.map((preset) => (
              <button
                key={preset.value}
                className={`preset-btn ${perfSettings.preset === preset.value ? "active" : ""}`}
                onClick={() => applyPreset(preset.value)}
              >
                <span className="preset-label">{preset.label}</span>
                <span className="preset-desc">{preset.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 상세 설정 */}
        <div className="settings-section">
          <h3>🔧 {t("settings.performance.detailedSettings")}</h3>

          <div className="setting-row toggle">
            <label>
              <span className="setting-label">
                {t("settings.performance.webWorkers")}
              </span>
              <span className="setting-hint">
                {t("settings.performance.webWorkersDesc")}
              </span>
            </label>
            <input
              type="checkbox"
              checked={perfSettings.useWebWorkers}
              onChange={(e) =>
                updatePerfSettings({ useWebWorkers: e.target.checked })
              }
              disabled={!hardware?.webWorkerSupported}
            />
          </div>

          <div className="setting-row toggle">
            <label>
              <span className="setting-label">
                {t("settings.performance.gpuAcceleration")}
              </span>
              <span className="setting-hint">
                {t("settings.performance.gpuAccelerationDesc")}
              </span>
            </label>
            <input
              type="checkbox"
              checked={perfSettings.useGpuAcceleration}
              onChange={(e) =>
                updatePerfSettings({ useGpuAcceleration: e.target.checked })
              }
              disabled={!hardware?.webglSupported}
            />
          </div>

          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.performance.waveformQuality")}
              </span>
            </label>
            <select
              value={perfSettings.waveformQuality}
              onChange={(e) =>
                updatePerfSettings({ waveformQuality: e.target.value })
              }
            >
              {qualityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.performance.sceneDetectionQuality")}
              </span>
            </label>
            <select
              value={perfSettings.sceneDetectionQuality}
              onChange={(e) =>
                updatePerfSettings({ sceneDetectionQuality: e.target.value })
              }
            >
              {qualityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setting-row toggle">
            <label>
              <span className="setting-label">
                {t("settings.performance.animation")}
              </span>
            </label>
            <input
              type="checkbox"
              checked={perfSettings.animationsEnabled}
              onChange={(e) =>
                updatePerfSettings({ animationsEnabled: e.target.checked })
              }
            />
          </div>

          <div className="setting-row toggle">
            <label>
              <span className="setting-label">
                {t("settings.performance.waveformCache")}
              </span>
              <span className="setting-hint">
                {t("settings.performance.waveformCacheDesc")}
              </span>
            </label>
            <input
              type="checkbox"
              checked={perfSettings.useWaveformCache}
              onChange={(e) =>
                updatePerfSettings({ useWaveformCache: e.target.checked })
              }
            />
          </div>

          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.performance.maxUndoCount")}
              </span>
              <span className="setting-hint">
                {t("settings.performance.maxUndoCountDesc")}
              </span>
            </label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={perfSettings.maxUndoCount ?? 10}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                if (!Number.isFinite(raw)) return;
                const clamped = Math.max(1, Math.min(50, raw));
                updatePerfSettings({ maxUndoCount: clamped });
              }}
            />
          </div>
        </div>

        <div className="settings-actions">
          <button
            className="btn-reset"
            onClick={() => {
              initHardware();
              applyPreset("auto");
            }}
          >
            🔄 {t("settings.performance.resetAutoDetect")}
          </button>
        </div>
      </div>
    );
  };

  // AI 설정 탭
  // LLM 연결 테스트 핸들러
  const handleTestLLM = async () => {
    setIsTestingLLM(true);
    try {
      await testLLMConnection();
    } finally {
      setIsTestingLLM(false);
    }
  };

  // STT 연결 테스트 핸들러 (통합)
  const handleTestSTT = async () => {
    setIsTestingSTT(true);
    try {
      await testSTTConnection();
    } finally {
      setIsTestingSTT(false);
    }
  };

  // 번역 기능 테스트 핸들러
  const handleTranslationTest = async () => {
    setIsTranslationTesting(true);
    setTranslationTestResult(null);

    const testSubtitles = [
      { id: "1", text: "안녕하세요, 반갑습니다.", startTime: 0, endTime: 2 },
      { id: "2", text: "오늘 날씨가 좋네요.", startTime: 2, endTime: 4 },
      { id: "3", text: "감사합니다.", startTime: 4, endTime: 6 },
    ];

    try {
      const result = await translateSubtitles(
        testSubtitles,
        llmConfig.targetLanguage,
      );
      setTranslationTestResult({
        success: true,
        original: testSubtitles,
        translated: result,
      });
    } catch (error) {
      console.error("❌ 번역 오류:", error);
      setTranslationTestResult({
        success: false,
        error: error.message,
      });
    } finally {
      setIsTranslationTesting(false);
    }
  };

  // STT 기능 테스트 핸들러 (통합 - 현재 선택된 provider 기준)
  const handleSTTTest = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSTTTesting(true);
    setSTTTestResult(null);

    try {
      const result = await transcribeAudio(file);
      setSTTTestResult({
        success: true,
        subtitles: result,
      });
    } catch (error) {
      // 엔진명/스택이 노출되지 않도록 콘솔/화면 모두 마스킹된 메시지만 노출.
      const safeMessage = mapSTTErrorMessage(error);
      console.error("❌ STT 오류:", safeMessage);
      setSTTTestResult({
        success: false,
        error: safeMessage,
      });
    } finally {
      setIsSTTTesting(false);
      // 파일 입력 초기화
      event.target.value = "";
    }
  };

  // 섹션 접기/펼치기 토글
  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const renderAITab = () => {
    const llmProviders = getAvailableLLMProviders();
    const sttProvidersList = getAvailableSTTProviders();
    const currentLLMProvider = llmProviders.find(
      (p) => p.id === llmConfig.provider,
    );
    const currentSTTProvider = sttProvidersList.find(
      (p) => p.id === sttConfig.provider,
    );

    // 현재 STT provider의 credentials와 설정
    const currentSTTCredentials =
      sttConfig.credentials?.[sttConfig.provider] || {};
    const currentSTTSettings =
      sttConfig.providerSettings?.[sttConfig.provider] || {};

    // 서버/로컬 모드 확인
    const isServerMode = useSubtitleStore.getState().isServerMode;

    return (
      <div className="settings-tab-content">
        {/* 모드별 안내 */}
        <div className={`mode-notice ${isServerMode ? "server" : "local"}`}>
          {isServerMode ? (
            <>
              <span className="mode-badge server">
                {t("toolbar.serverMode")}
              </span>
              <span className="mode-desc">{t("toolbar.serverModeDesc")}</span>
            </>
          ) : (
            <>
              <span className="mode-badge local">{t("toolbar.localMode")}</span>
              <span className="mode-desc">{t("toolbar.localModeDesc")}</span>
            </>
          )}
        </div>

        {/* LLM 설정 섹션 */}
        <div
          className={`settings-section collapsible ${collapsedSections.llm ? "collapsed" : ""}`}
        >
          <div className="section-header" onClick={() => toggleSection("llm")}>
            <h3>
              🤖 {t("settings.ai.llmTitle")}
              <span className="section-desc-inline">
                {t("settings.ai.llmDesc")}
              </span>
            </h3>
            <span className="collapse-icon">▼</span>
          </div>
          <div className="section-content">
            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.ai.provider")}
                </span>
              </label>
              <select
                value={llmConfig.provider}
                onChange={(e) => setLLMConfig({ provider: e.target.value })}
              >
                {llmProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            {currentLLMProvider?.models && (
              <div className="setting-row">
                <label>
                  <span className="setting-label">
                    {t("settings.ai.model")}
                  </span>
                </label>
                <select
                  value={llmConfig.model}
                  onChange={(e) => setLLMConfig({ model: e.target.value })}
                >
                  {currentLLMProvider.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="api-key-row">
              <div className="api-key-header">
                <span className="provider-icon">🔑</span>
                <div className="provider-info">
                  <span className="provider-name">
                    {currentLLMProvider?.name} API Key
                  </span>
                  <span className="provider-desc">
                    {currentLLMProvider?.description}
                  </span>
                </div>
                {isLLMConnected && (
                  <span className="key-status valid">
                    ✓ {t("settings.ai.connected")}
                  </span>
                )}
              </div>
              <div className="api-key-input">
                <input
                  type={showKeys.llmApiKey ? "text" : "password"}
                  value={llmConfig.apiKeys?.[llmConfig.provider] || ""}
                  onChange={(e) =>
                    setLLMApiKey(llmConfig.provider, e.target.value)
                  }
                  placeholder={
                    currentLLMProvider?.requiredFields?.[0]?.placeholder ||
                    t("settings.ai.apiKeyPlaceholder")
                  }
                />
                <button
                  className="btn-toggle-visibility"
                  onClick={() => toggleKeyVisibility("llmApiKey")}
                  title={
                    showKeys.llmApiKey
                      ? t("settings.ai.hideTitle")
                      : t("settings.ai.showTitle")
                  }
                >
                  {showKeys.llmApiKey ? "🙈" : "👁️"}
                </button>
              </div>
              <div className="api-key-actions">
                <button
                  className="btn-test-connection"
                  onClick={handleTestLLM}
                  disabled={
                    !llmConfig.apiKeys?.[llmConfig.provider] || isTestingLLM
                  }
                >
                  {isTestingLLM
                    ? t("toolbar.testing")
                    : `🔗 ${t("settings.ai.connectionTest")}`}
                </button>
                {lastLLMTestResult && (
                  <span
                    className={`test-result ${lastLLMTestResult.success ? "success" : "error"}`}
                  >
                    {lastLLMTestResult.message}
                  </span>
                )}
              </div>
            </div>

            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.ai.defaultTranslateLang")}
                </span>
              </label>
              <select
                value={llmConfig.targetLanguage}
                onChange={(e) =>
                  setLLMConfig({ targetLanguage: e.target.value })
                }
              >
                <option value="ko">{t("settings.ai.langKo")}</option>
                <option value="en">영어</option>
                <option value="ja">일본어</option>
                <option value="zh">중국어</option>
                <option value="es">스페인어</option>
                <option value="fr">프랑스어</option>
                <option value="de">독일어</option>
              </select>
            </div>
          </div>
          {/* section-content 닫기 */}
        </div>

        {/* STT 설정 섹션 (통합) */}
        <div
          className={`settings-section collapsible ${collapsedSections.stt ? "collapsed" : ""}`}
        >
          <div className="section-header" onClick={() => toggleSection("stt")}>
            <h3>
              🎤 {t("settings.ai.sttTitle")}
              <span className="section-desc-inline">
                {currentSTTProvider?.name || "STT 서비스"}
              </span>
            </h3>
            <span className="collapse-icon">▼</span>
          </div>
          <div className="section-content">
            {/* 서비스 제공자 선택 */}
            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.ai.provider")}
                </span>
              </label>
              <select
                value={sttConfig.provider}
                onChange={(e) => setSTTProvider(e.target.value)}
              >
                {sttProvidersList.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 모델 선택 (models가 있는 provider만) */}
            {currentSTTProvider?.models?.length > 0 && (
              <div className="setting-row">
                <label>
                  <span className="setting-label">
                    {t("settings.ai.model")}
                  </span>
                </label>
                <select
                  value={currentSTTSettings.model || ""}
                  onChange={(e) =>
                    setSTTProviderSetting("model", e.target.value)
                  }
                >
                  {currentSTTProvider.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Credentials - provider의 requiredFields 기반 동적 렌더링 */}
            {currentSTTProvider?.requiredFields?.map((field, index) => (
              <div className="api-key-row" key={field.key}>
                <div className="api-key-header">
                  <span className="provider-icon">
                    {field.type === "password" ? "🔐" : "🔑"}
                  </span>
                  <div className="provider-info">
                    <span className="provider-name">{field.label}</span>
                    {index === 0 && (
                      <span className="provider-desc">
                        {currentSTTProvider?.description}
                      </span>
                    )}
                  </div>
                  {index === 0 && isSTTConnected && (
                    <span className="key-status valid">
                      ✓ {t("settings.ai.connected")}
                    </span>
                  )}
                </div>
                <div className="api-key-input">
                  <input
                    type={
                      showKeys[`stt_${sttConfig.provider}_${field.key}`]
                        ? "text"
                        : "password"
                    }
                    value={currentSTTCredentials[field.key] || ""}
                    onChange={(e) =>
                      setSTTCredential(field.key, e.target.value)
                    }
                    placeholder={
                      field.placeholder || `${field.label}를 입력하세요`
                    }
                  />
                  <button
                    className="btn-toggle-visibility"
                    onClick={() =>
                      toggleKeyVisibility(
                        `stt_${sttConfig.provider}_${field.key}`,
                      )
                    }
                    title={
                      showKeys[`stt_${sttConfig.provider}_${field.key}`]
                        ? t("settings.ai.hideTitle")
                        : t("settings.ai.showTitle")
                    }
                  >
                    {showKeys[`stt_${sttConfig.provider}_${field.key}`]
                      ? "🙈"
                      : "👁️"}
                  </button>
                </div>
                {/* 마지막 필드에만 연결 테스트 버튼 표시 */}
                {index === currentSTTProvider.requiredFields.length - 1 && (
                  <div className="api-key-actions">
                    <button
                      className="btn-test-connection"
                      onClick={handleTestSTT}
                      disabled={
                        currentSTTProvider.requiredFields.some(
                          (f) => !currentSTTCredentials[f.key],
                        ) || isTestingSTT
                      }
                    >
                      {isTestingSTT
                        ? t("toolbar.testing")
                        : `🔗 ${t("settings.ai.connectionTest")}`}
                    </button>
                    {lastSTTTestResult && (
                      <span
                        className={`test-result ${lastSTTTestResult.success ? "success" : "error"}`}
                      >
                        {lastSTTTestResult.message}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* 인식 언어 */}
            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("sttConfig.recognitionLanguage")}
                </span>
              </label>
              <select
                value={currentSTTSettings.language || ""}
                onChange={(e) =>
                  setSTTProviderSetting("language", e.target.value)
                }
              >
                {currentSTTProvider?.languages?.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 화자 분리 옵션 (지원하는 provider만) */}
            {currentSTTProvider?.options?.diarize && (
              <div className="setting-row toggle">
                <label>
                  <span className="setting-label">
                    {t("settings.ai.diarization")}
                  </span>
                  <span className="setting-hint">
                    {t("settings.ai.diarizationDesc")}
                  </span>
                </label>
                <input
                  type="checkbox"
                  checked={currentSTTSettings.diarize || false}
                  onChange={(e) =>
                    setSTTProviderSetting("diarize", e.target.checked)
                  }
                />
              </div>
            )}

            {/* 세그먼트 분리 설정 (공통) */}
            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.ai.maxSegmentLength")}
                </span>
                <span className="setting-hint">
                  {t("settings.ai.maxSegmentLengthSync")}
                </span>
              </label>
              <input
                type="number"
                min="10"
                max="200"
                step="5"
                value={sttConfig.segmentOptions?.maxSegmentLength ?? 80}
                onChange={(e) => {
                  const val = e.target.value;
                  setSTTSegmentOption(
                    "maxSegmentLength",
                    val === "" ? "" : parseInt(val),
                  );
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (!val || isNaN(val))
                    setSTTSegmentOption("maxSegmentLength", 80);
                }}
              />
            </div>

            <div className="setting-row">
              <label>
                <span className="setting-label">
                  {t("settings.ai.splitInterval")}
                </span>
                <span className="setting-hint">
                  {t("settings.ai.splitIntervalDesc")}
                </span>
              </label>
              <input
                type="number"
                min="0.5"
                max="5.0"
                step="0.1"
                value={sttConfig.segmentOptions?.splitTimeGap || 2.0}
                onChange={(e) =>
                  setSTTSegmentOption(
                    "splitTimeGap",
                    parseFloat(e.target.value) || 2.0,
                  )
                }
              />
            </div>
          </div>
          {/* section-content 닫기 */}
        </div>

        {/* 기능 테스트 섹션 */}
        <div
          className={`settings-section collapsible ${collapsedSections.functionTest ? "collapsed" : ""}`}
        >
          <div
            className="section-header"
            onClick={() => toggleSection("functionTest")}
          >
            <h3>
              🧪 {t("settings.ai.featureTest")}
              <span className="section-desc-inline">
                {t("settings.ai.featureTestDesc")}
              </span>
            </h3>
            <span className="collapse-icon">▼</span>
          </div>
          <div className="section-content">
            {/* 번역 테스트 */}
            <div className="test-section">
              <div className="test-header">
                <span className="test-title">
                  📝 {t("settings.ai.translateTest")}
                </span>
                <span className="test-desc">
                  {t("settings.ai.translateTestDesc", {
                    targetLanguageName:
                      llmConfig.targetLanguage === "en"
                        ? "English"
                        : llmConfig.targetLanguage === "ja"
                          ? "日本語"
                          : llmConfig.targetLanguage,
                  })}
                </span>
              </div>
              <button
                className="btn-test-function"
                onClick={handleTranslationTest}
                disabled={
                  !llmConfig.apiKeys?.[llmConfig.provider] ||
                  isTranslationTesting
                }
              >
                {isTranslationTesting
                  ? t("settings.ai.translating")
                  : `🚀 ${t("settings.ai.runTranslateTest")}`}
              </button>
              {translationTestResult && (
                <div
                  className={`test-result-box ${translationTestResult.success ? "success" : "error"}`}
                >
                  {translationTestResult.success ? (
                    <div className="translation-result">
                      <div className="result-label">
                        {t("settings.ai.translateResult")}
                      </div>
                      {translationTestResult.translated.map((item, idx) => (
                        <div key={idx} className="result-item">
                          <span className="original">
                            {translationTestResult.original[idx]?.text}
                          </span>
                          <span className="arrow">→</span>
                          <span className="translated">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="error-message">
                      ❌{" "}
                      {t("settings.ai.errorMessage", {
                        errorMessage: translationTestResult.error,
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* STT 테스트 (통합) */}
            <div className="test-section">
              <div className="test-header">
                <span className="test-title">
                  🎤 {t("settings.ai.sttTest")}
                </span>
                <span className="test-desc">
                  {t("settings.ai.sttTestDesc", {
                    providerName: currentSTTProvider?.name || "STT",
                    language: currentSTTSettings.language || "",
                  })}
                </span>
              </div>
              <label className="btn-test-function file-input-label">
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleSTTTest}
                  disabled={
                    currentSTTProvider?.requiredFields?.some(
                      (f) => !currentSTTCredentials[f.key],
                    ) || isSTTTesting
                  }
                  style={{ display: "none" }}
                />
                {isSTTTesting
                  ? t("settings.ai.sttProcessing")
                  : `📂 ${t("settings.ai.selectAudioFile")}`}
              </label>
              {sttTestResult && (
                <div
                  className={`test-result-box ${sttTestResult.success ? "success" : "error"}`}
                >
                  {sttTestResult.success ? (
                    <div className="stt-result">
                      <div className="result-label">
                        {t("settings.ai.recognitionResult", {
                          count: sttTestResult.subtitles.length,
                        })}
                      </div>
                      {sttTestResult.subtitles.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="result-item">
                          <span className="translated">{item.text}</span>
                          {item.speakerId && (
                            <span className="speaker-tag">
                              [{item.speakerId}]
                            </span>
                          )}
                        </div>
                      ))}
                      {sttTestResult.subtitles.length > 5 && (
                        <div className="result-more">
                          {t("settings.ai.moreResults", {
                            count: sttTestResult.subtitles.length - 5,
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="error-message">
                      ❌{" "}
                      {t("settings.ai.errorMessage", {
                        errorMessage: sttTestResult.error,
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* section-content 닫기 */}
        </div>

        <div className="settings-actions">
          <button className="btn-reset" onClick={resetAllAISettings}>
            🔄 {t("settings.ai.resetAiSettings")}
          </button>
        </div>
      </div>
    );
  };

  // 단축키 탭
  const renderShortcutsTab = () => {
    const renderKeyBadge = (key, category) => {
      let className = "key-badge";
      if (category === "audio") className += " audio";
      if (category === "video") className += " video";
      // 특수 키 스타일
      // macOS 특수 키 아이콘 (⌘, ⌥, ⌃)
      if (["⌘", "⌥", "⌃"].includes(key)) {
        className += " mac-modifier";
      }
      return (
        <span key={key} className={className}>
          {key}
        </span>
      );
    };

    const handleShortcutDoubleClick = (shortcut) => {
      setEditingShortcut({
        id: shortcut.id,
        action: shortcut.actionKey ? t(shortcut.actionKey) : shortcut.action,
        displayKeys: shortcut.displayKeys,
        displayKeys2: shortcut.displayKeys2,
        category: shortcut.category,
      });
      setEditingSlot("main");
      setMainCapture({ keys: [], modifiers: [], key: null, changed: false });
      setSubCapture({ keys: [], modifiers: [], key: null, changed: false });
      setDuplicateWarning(null);
    };

    // store에서 단축키 목록 가져오기 (UI에서 숨길 단축키 제외)
    const HIDDEN_SHORTCUT_IDS = ["outSync"];
    const shortcutsList = getShortcutsList().filter(
      (s) => !HIDDEN_SHORTCUT_IDS.includes(s.id),
    );

    const renderShortcutRow = (shortcut) => {
      const defaultShortcut = getDefaultShortcut(shortcut.id);
      const current = shortcuts[shortcut.id];
      const isModified =
        defaultShortcut &&
        (JSON.stringify(current?.modifiers) !==
          JSON.stringify(defaultShortcut.modifiers) ||
          current?.key !== defaultShortcut.key ||
          JSON.stringify(current?.modifiers2) !==
            JSON.stringify(defaultShortcut.modifiers2) ||
          current?.key2 !== defaultShortcut.key2);

      return (
        <div
          key={shortcut.id}
          className={`shortcut-row editable ${isModified ? "modified" : ""}`}
          onDoubleClick={() => handleShortcutDoubleClick(shortcut)}
          title={t("settings.shortcuts.editHint")}
        >
          <div className="shortcut-keys">
            {shortcut.displayKeys.map((key, i) => (
              <span key={i}>
                {renderKeyBadge(key, shortcut.category)}
                {i < shortcut.displayKeys.length - 1 && (
                  <span className="key-separator">+</span>
                )}
              </span>
            ))}
            <span className="key-slot-divider">/</span>
            {shortcut.displayKeys2 ? (
              shortcut.displayKeys2.map((key, i) => (
                <span key={`sub-${i}`}>
                  {renderKeyBadge(key, shortcut.category)}
                  {i < shortcut.displayKeys2.length - 1 && (
                    <span className="key-separator">+</span>
                  )}
                </span>
              ))
            ) : (
              <span className="key-badge empty">---</span>
            )}
          </div>
          <span className="shortcut-action">
            {shortcut.actionKey ? t(shortcut.actionKey) : shortcut.action}
            {isModified && (
              <span className="modified-indicator" title="기본값에서 변경됨">
                *
              </span>
            )}
          </span>
          <span className="shortcut-edit-hint">✏️</span>
        </div>
      );
    };

    return (
      <div className="settings-tab-content shortcuts-tab">
        {/* 카테고리 범례 */}
        <div className="shortcuts-legend">
          <div className="legend-item">
            <span className="legend-badge common"></span>
            <span>{t("settings.shortcuts.categoryCommon")}</span>
          </div>
          <div className="legend-item">
            <span className="legend-badge audio"></span>
            <span>{t("settings.shortcuts.categoryAudioOnly")}</span>
          </div>
          <div className="legend-item">
            <span className="legend-badge video"></span>
            <span>{t("settings.shortcuts.categoryVideoOnly")}</span>
          </div>
        </div>

        <div className="settings-section">
          <h3>⏱️ {t("settings.subtitleEditor.syncStartPoint")}</h3>
          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.subtitleEditor.moveUnit")}
              </span>
              <span className="setting-hint">
                {t("settings.subtitleEditor.moveUnitDesc")}
              </span>
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={Math.round((subtitleEditor?.syncStartNudgeStepSec ?? 0.001) * 1000)}
              onChange={(e) => {
                const ms = parseInt(e.target.value, 10);
                updateSubtitleEditor({
                  syncStartNudgeStepSec: Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0.001,
                });
              }}
            />
          </div>
          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.subtitleEditor.syncOffset")}
              </span>
              <span className="setting-hint">
                {t("settings.subtitleEditor.syncOffsetDesc")}
              </span>
            </label>
            <input
              type="number"
              min="-2000"
              max="2000"
              step="10"
              value={Math.round((subtitleEditor?.syncSplitOffsetSec ?? 0) * 1000)}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                updateSubtitleEditor({
                  syncSplitOffsetSec: Number.isFinite(value) ? value / 1000 : 0,
                });
              }}
            />
          </div>
          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.subtitleEditor.minSplitGap")}
              </span>
              <span className="setting-hint">
                {t("settings.subtitleEditor.minSplitGapDesc")}
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="2000"
              step="10"
              value={Math.round((subtitleEditor?.minSplitGapSec ?? 0.1) * 1000)}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                updateSubtitleEditor({
                  minSplitGapSec: Number.isFinite(value) ? value / 1000 : 0.1,
                });
              }}
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>⏮️⏭️ {t("settings.subtitleEditor.timeJump")}</h3>
          <div className="setting-row">
            <label>
              <span className="setting-label">
                {t("settings.subtitleEditor.moveUnit")}
              </span>
              <span className="setting-hint">
                {t("settings.subtitleEditor.timeJumpDesc")}
              </span>
            </label>
            <input
              type="number"
              min="100"
              max="60000"
              step="100"
              value={Math.round((subtitleEditor?.mediaSeekStepSec ?? 3) * 1000)}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                updateSubtitleEditor({
                  mediaSeekStepSec: Number.isFinite(value) ? value / 1000 : 3,
                });
              }}
            />
          </div>
        </div>

        <div className="shortcuts-list">
          {shortcutsList.map((shortcut) => renderShortcutRow(shortcut))}
        </div>

        <div className="shortcuts-note">
          <span className="note-icon">💡</span>
          <span>
            {isMac
              ? t("settings.shortcuts.macHint")
              : t("settings.shortcuts.windowsHint")}
          </span>
        </div>

        <div className="shortcuts-edit-hint">
          <span>✏️ {t("settings.shortcuts.editHint")}</span>
        </div>

        <div className="settings-actions">
          <button className="btn-reset" onClick={resetAllShortcuts}>
            🔄 {t("settings.shortcuts.resetAll")}
          </button>
        </div>
      </div>
    );
  };

  // 단축키 편집 확인
  const handleShortcutEditConfirm = () => {
    if (duplicateWarning) return;
    const updates = {};
    if (mainCapture.changed && mainCapture.key) {
      updates.modifiers = mainCapture.modifiers;
      updates.key = mainCapture.key;
    }
    if (subCapture.changed && subCapture.key) {
      updates.modifiers2 = subCapture.modifiers;
      updates.key2 = subCapture.key;
    }
    if (Object.keys(updates).length > 0) {
      updateShortcut(editingShortcut.id, updates);
    }
    setEditingShortcut(null);
    setDuplicateWarning(null);
  };

  // 단축키 편집 취소
  const handleShortcutEditCancel = () => {
    setEditingShortcut(null);
    setDuplicateWarning(null);
  };

  // 서브 단축키 삭제
  const handleClearSubShortcut = () => {
    if (editingShortcut) {
      clearSubShortcut(editingShortcut.id);
      setSubCapture({ keys: [], modifiers: [], key: null, changed: false });
      setEditingShortcut((prev) => prev ? { ...prev, displayKeys2: null } : null);
      setDuplicateWarning(null);
    }
  };

  // 단축키 기본값으로 복원
  const handleResetToDefault = () => {
    if (editingShortcut) {
      resetShortcut(editingShortcut.id);
      const defaultShortcut = getDefaultShortcut(editingShortcut.id);
      if (defaultShortcut) {
        const displayMods = defaultShortcut.modifiers.map((m) =>
          getModifierDisplayName(m),
        );
        const displayKey = getKeyDisplay(defaultShortcut.key);
        setMainCapture({
          keys: [...displayMods, displayKey],
          modifiers: defaultShortcut.modifiers,
          key: defaultShortcut.key,
          changed: false,
        });
        setSubCapture({ keys: [], modifiers: [], key: null, changed: false });
        setEditingShortcut((prev) => prev ? { ...prev, displayKeys2: null } : null);
        setDuplicateWarning(null);
      }
    }
  };

  // 캡처 영역 렌더링 헬퍼
  const renderCaptureSlot = (slot, capture, currentDisplayKeys) => {
    const isActive = editingSlot === slot;
    const hasWarning = isActive && duplicateWarning;
    const keysToShow = capture.changed ? capture.keys : (currentDisplayKeys || []);

    return (
      <div
        className={`shortcut-edit-capture ${isActive ? "active-slot" : ""}`}
        onClick={() => { setEditingSlot(slot); setDuplicateWarning(null); }}
      >
        <div className="slot-header">
          <span className="label">
            {slot === "main"
              ? t("settings.shortcuts.mainShortcut")
              : t("settings.shortcuts.subShortcut")}
          </span>
          {slot === "sub" && (currentDisplayKeys || capture.changed) && (
            <button
              className="btn-clear-sub"
              onClick={(e) => { e.stopPropagation(); handleClearSubShortcut(); }}
              title={t("settings.shortcuts.clearSub")}
            >
              ✕
            </button>
          )}
        </div>
        <div
          className={`capture-area ${isActive ? "capturing" : ""} ${hasWarning ? "has-warning" : ""}`}
        >
          {keysToShow.length > 0 ? (
            <div className="shortcut-keys-display">
              {keysToShow.map((key, i) => (
                <span key={i}>
                  <span
                    className={`key-badge ${capture.changed ? "captured" : ""} ${hasWarning ? "warning" : ""}`}
                  >
                    {key}
                  </span>
                  {i < keysToShow.length - 1 && (
                    <span className="key-separator">+</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <span className="capture-placeholder">
              {isActive
                ? t("settings.shortcuts.pressKeyPlaceholder")
                : t("settings.shortcuts.clickToEdit")}
            </span>
          )}
        </div>
        {isActive && duplicateWarning && (
          <div className="duplicate-warning">⚠️ {duplicateWarning}</div>
        )}
        {isActive && !capture.key && capture.keys.length > 0 && (
          <div className="modifier-only-hint">
            {t("settings.shortcuts.modifierOnlyWarning")}
          </div>
        )}
      </div>
    );
  };

  // 단축키 편집 모달
  const renderShortcutEditModal = () => {
    if (!editingShortcut) return null;

    const hasValidChange =
      (mainCapture.changed && mainCapture.key) ||
      (subCapture.changed && subCapture.key);

    return (
      <div className="shortcut-edit-overlay" onClick={handleShortcutEditCancel}>
        <div
          className="shortcut-edit-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shortcut-edit-header">
            <h3>⌨️ {t("settings.shortcuts.editShortcut")}</h3>
            <button className="close-btn" onClick={handleShortcutEditCancel}>
              ✕
            </button>
          </div>

          <div className="shortcut-edit-body">
            <div className="shortcut-edit-action">
              <span className="label">
                {t("settings.shortcuts.functionLabel")}
              </span>
              <span className="value">{editingShortcut.actionKey ? t(editingShortcut.actionKey) : editingShortcut.action}</span>
            </div>

            {renderCaptureSlot("main", mainCapture, editingShortcut.displayKeys)}
            {renderCaptureSlot("sub", subCapture, editingShortcut.displayKeys2)}
          </div>

          <div className="shortcut-edit-footer">
            <button className="btn-reset" onClick={handleResetToDefault}>
              🔄 {t("settings.shortcuts.defaultButton")}
            </button>
            <div className="footer-actions">
              <button className="btn-cancel" onClick={handleShortcutEditCancel}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-confirm"
                onClick={handleShortcutEditConfirm}
                disabled={!hasValidChange || !!duplicateWarning}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "general":
        return renderGeneralTab();
      case "subtitleEditor":
        return renderSubtitleEditorTab();
      case "waveform":
        return renderWaveformTab();
      case "shortcuts":
        return renderShortcutsTab();
      case "performance":
        return renderPerformanceTab();
      case "ai":
        return renderAITab();
      default:
        return null;
    }
  };

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2>⚙️ {t("toolbar.settingsTitle")}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* 탭 네비게이션 */}
          <nav className="settings-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">
                  {t(`settings.tabs.${tab.id}`)}
                </span>
              </button>
            ))}
          </nav>

          {/* 탭 콘텐츠 */}
          <div className="settings-content">{renderTabContent()}</div>
        </div>

        <div className="settings-footer">
          <span className="footer-hint">{t("settings.autoSaveMessage")}</span>
          <button className="btn-close" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>

      {/* 단축키 편집 모달 */}
      {renderShortcutEditModal()}
    </div>
  );
}
