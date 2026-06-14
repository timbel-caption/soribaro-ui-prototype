import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import "./SpeakerSelectDropdown.css";

/**
 * 자막 행별 화자 선택 커스텀 드롭다운.
 * native <select> 가 picker 열린 동안 하이라이트 위치를 JS 로 노출하지 않아
 * wrap/typeahead 등을 구현할 수 없어 직접 구현.
 *
 * - 트리거 버튼은 `.speaker-select` className 유지 (외부 querySelector 호환).
 * - 외부에서 열려면 ref.current.open() 호출 (Ctrl+F1 등).
 * - 닫힌 상태 키 (←/→/↑/↓/Esc) 는 콜백으로 위임, 열린 상태 키는 내부 처리.
 */
const SpeakerSelectDropdown = forwardRef(function SpeakerSelectDropdown(
  {
    value,
    speakers,
    onChange,
    onClosedArrowVertical,
    onClosedArrowLeft,
    onClosedArrowRight,
    onClosedEscape,
    className = "speaker-select",
  },
  ref,
) {
  const { t } = useTranslation("worktool");
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const typeaheadRef = useRef({ buffer: "", timer: null });

  const options = useMemo(() => {
    const opts = [
      { value: null, label: t("subtitle.unassignedSpeaker"), color: null },
      { value: 0, label: t("subtitle.blankSpeaker"), color: null },
    ];
    Object.values(speakers || {})
      .sort((a, b) => a.number - b.number)
      .forEach((s) => {
        opts.push({
          value: s.number,
          label: `${s.number}: ${s.name}`,
          color: s.color,
          number: s.number,
        });
      });
    return opts;
  }, [speakers, t]);

  const selectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx < 0 ? 0 : idx;
  }, [options, value]);

  const selected = options[selectedIndex];

  const clearTypeahead = useCallback(() => {
    const ta = typeaheadRef.current;
    ta.buffer = "";
    if (ta.timer) {
      clearTimeout(ta.timer);
      ta.timer = null;
    }
  }, []);

  const open = useCallback(() => {
    setHighlightIndex(selectedIndex);
    setIsOpen(true);
  }, [selectedIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    clearTypeahead();
  }, [clearTypeahead]);

  const commit = useCallback(
    (newValue) => {
      onChange?.(newValue);
      close();
      // 커밋 후 트리거에 포커스 유지 (다음 키 입력 받을 수 있도록)
      setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0);
    },
    [onChange, close],
  );

  // 외부 트리거 (Ctrl+F1 등) 를 위한 imperative API
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        // 외부 키 이벤트 처리 도중 호출되어 다른 핸들러가 focus 를 뺏을 수 있어
        // 동기 + rAF 양쪽에서 보장한다.
        triggerRef.current?.focus({ preventScroll: true });
        open();
      },
      focus: () => triggerRef.current?.focus({ preventScroll: true }),
      element: () => triggerRef.current,
    }),
    [open],
  );

  // isOpen 이 true 가 되었는데 트리거가 포커스를 잃은 상태라면 다시 포커스.
  // (Ctrl+F1 같이 외부에서 열린 경우 키 이벤트 처리 순서 때문에 focus 가
  // 다른 곳에 잡혀 있을 수 있다.)
  useEffect(() => {
    if (!isOpen) return;
    if (document.activeElement !== triggerRef.current) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // 위치 계산
  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  // 하이라이트 옵션 scrollIntoView
  useEffect(() => {
    if (!isOpen) return;
    const listEl = listRef.current;
    if (!listEl) return;
    const optEl = listEl.children[highlightIndex];
    if (optEl) optEl.scrollIntoView({ block: "nearest" });
  }, [isOpen, highlightIndex]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        listRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      ) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => () => clearTypeahead(), [clearTypeahead]);

  const tryTypeahead = useCallback(
    (key) => {
      if (!/^\d$/.test(key)) return false;
      const ta = typeaheadRef.current;
      // 3 자리 초과 시 새로 시작
      if (ta.buffer.length >= 3) ta.buffer = "";
      ta.buffer += key;
      if (ta.timer) clearTimeout(ta.timer);
      ta.timer = setTimeout(() => {
        ta.buffer = "";
        ta.timer = null;
      }, 800);
      const num = parseInt(ta.buffer, 10);
      const idx = options.findIndex((o) => o.value === num);
      if (idx >= 0) setHighlightIndex(idx);
      return true;
    },
    [options],
  );

  const handleKeyDown = useCallback(
    (e) => {
      // ←/→ 는 열림/닫힘 무관하게 닫고 위임 (행/텍스트 포커스 이동)
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) close();
        onClosedArrowLeft?.();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) close();
        onClosedArrowRight?.();
        return;
      }

      if (isOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setHighlightIndex((idx) => (idx + 1) % options.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setHighlightIndex(
            (idx) => (idx - 1 + options.length) % options.length,
          );
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          e.stopPropagation();
          setHighlightIndex(0);
          return;
        }
        if (e.key === "End") {
          e.preventDefault();
          e.stopPropagation();
          setHighlightIndex(options.length - 1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          commit(options[highlightIndex].value);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
        if (tryTypeahead(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        return;
      }

      // 닫힌 상태
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        onClosedArrowVertical?.(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        onClosedArrowVertical?.(-1);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        open();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClosedEscape?.();
        return;
      }
    },
    [
      isOpen,
      options,
      highlightIndex,
      open,
      close,
      commit,
      tryTypeahead,
      onClosedArrowLeft,
      onClosedArrowRight,
      onClosedArrowVertical,
      onClosedEscape,
    ],
  );

  const triggerStyle = useMemo(() => {
    if (!selected?.color) return undefined;
    return {
      borderColor: selected.color,
      backgroundColor: `${selected.color}20`,
    };
  }, [selected]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        style={triggerStyle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="speaker-select-label">{selected?.label ?? ""}</span>
        <ChevronDown
          size={12}
          className="speaker-select-caret"
          aria-hidden="true"
        />
      </button>
      {isOpen &&
        createPortal(
          <ul
            ref={listRef}
            className="speaker-dropdown-list"
            role="listbox"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            // 옵션 클릭 시 트리거가 blur 되지 않도록
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((opt, idx) => (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={idx === selectedIndex}
                className={`speaker-dropdown-option ${idx === highlightIndex ? "highlighted" : ""} ${idx === selectedIndex ? "selected" : ""}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => commit(opt.value)}
              >
                <span
                  className="speaker-dropdown-dot"
                  style={
                    opt.color
                      ? { background: opt.color }
                      : { background: "transparent" }
                  }
                />
                <span className="speaker-dropdown-option-label">
                  {opt.label}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
});

export default SpeakerSelectDropdown;
