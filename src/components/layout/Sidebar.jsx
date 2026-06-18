import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useThemeStore, THEMES } from "../../stores/themeStore";
import { useLanguageStore, LANGUAGES } from "../../stores/languageStore";
import { useUserStore } from "../../stores/userStore";
import {
  Mic,
  FileText,
  Building2,
  Globe,
  Settings,
  GraduationCap,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Sun,
  Moon,
  Monitor,
  User,
  ChevronDown,
} from "lucide-react";
import "flag-icons/css/flag-icons.min.css";
import { toAppUrl } from "../../utils/worktoolRoute";
import "./Sidebar.css";

// lucide 아이콘 매핑
const ICON_MAP = {
  Mic,
  FileText,
  Building2,
  Globe,
  Settings,
  User,
  GraduationCap,
};

// 테마별 lucide 아이콘 매핑
const THEME_ICON_MAP = {
  default: Monitor,
  light: Sun,
  dark: Moon,
};

// 메뉴 구조 정의 (label은 i18n 키)
// [프로토타입] item.label(리터럴)이 있으면 i18n 키 대신 그대로 표시됩니다.
const menuData = [
  {
    // [프로토타입] 전체 화면을 한눈에 보고 이동하는 카탈로그
    id: "screen-index",
    label: "🧭 화면 목록 (프로토타입)",
    path: "/screens",
  },
  {
    // [프로토타입] README.md 뷰어
    id: "readme",
    label: "📄 Readme",
    path: "/readme",
  },
  {
    // [프로토타입] 업데이트 내역
    id: "updates",
    label: "🆕 Updates",
    path: "/updates",
  },
  {
    // [프로토타입] 개발중 화면 모음
    id: "dev",
    label: "🚧 [개발중]",
    children: [
      {
        id: "dev-project-task-types",
        label: "작업 유형·용어집 설정",
        path: "/dev/project-task-types",
      },
    ],
  },
  {
    id: "soribaro",
    labelKey: "sidebar.soribaro",
    icon: "Mic",
    children: [
      {
        id: "mypage",
        labelKey: "sidebar.mypage",
        icon: "User",
        path: "/soribaro/mypage",
      },
      {
        id: "recording",
        labelKey: "sidebar.recording",
        icon: "FileText",
        adminOnly: true,
        children: [
          {
            id: "recording-request",
            labelKey: "sidebar.requestManagement",
            path: "/soribaro/recording/request",
          },
          {
            id: "recording-work",
            labelKey: "sidebar.workManagement",
            path: "/soribaro/recording/work",
          },
        ],
      },
      {
        id: "meeting",
        labelKey: "sidebar.meeting",
        icon: "FileText",
        adminOnly: true,
        children: [
          {
            id: "meeting-work",
            labelKey: "sidebar.meetingWorkManagement",
            path: "/soribaro/meeting/work",
          },
        ],
      },
      {
        id: "enterprise",
        labelKey: "sidebar.enterprise",
        icon: "Building2",
        adminOnly: true,
        children: [
          {
            id: "enterprise-meeting",
            labelKey: "sidebar.meetingWorkManagement",
            path: "/soribaro/enterprise/meeting",
          },
          {
            id: "enterprise-vod",
            labelKey: "sidebar.vodWorkManagement",
            path: "/soribaro/enterprise/vod",
          },
        ],
      },
      {
        id: "training-service",
        labelKey: "sidebar.trainingService",
        icon: "GraduationCap",
        adminOnly: false,
        children: [
          {
            id: "training-assignments",
            labelKey: "sidebar.trainingAssignments",
            path: "/soribaro/training/assignments",
            adminOnly: true,
          },
          {
            id: "training-files",
            labelKey: "sidebar.trainingFiles",
            path: "/soribaro/training/files",
            adminOnly: true,
          },
          {
            id: "training-student",
            labelKey: "sidebar.trainingStudentPage",
            path: "/soribaro/training/student",
          },
          {
            id: "training-students-manage",
            labelKey: "sidebar.trainingStudentsManage",
            path: "/soribaro/training/students",
            adminOnly: true,
          },
          {
            id: "training-worktool",
            labelKey: "sidebar.trainingWorktool",
            path: "/worktool?mode=training&role=START&popup=true",
            openInNewWindow: true,
            adminOnly: true,
          },
        ],
      },
      {
        id: "service-manage",
        labelKey: "sidebar.serviceManagement",
        icon: "Settings",
        adminOnly: true,
        children: [
          {
            id: "manage-enterprise",
            labelKey: "sidebar.enterpriseManagement",
            path: "/soribaro/manage/enterprise",
          },
          {
            id: "manage-enterprise-customer",
            labelKey: "sidebar.enterpriseCustomerManagement",
            path: "/soribaro/manage/enterprise-customer",
          },
          {
            id: "manage-settlement",
            labelKey: "sidebar.settlementManagement",
            path: "/soribaro/manage/settlement",
          },
          {
            id: "manage-pricing",
            labelKey: "sidebar.pricing",
            path: "/soribaro/manage/pricing",
          },
          {
            id: "manage-depreciation",
            labelKey: "sidebar.depreciation",
            path: "/soribaro/manage/depreciation",
          },
          {
            id: "manage-worker",
            labelKey: "sidebar.workerManagement",
            path: "/soribaro/manage/worker",
          },
          {
            id: "manage-evaluation",
            labelKey: "sidebar.evaluationManagement",
            path: "/soribaro/manage/evaluation",
          },
          {
            id: "manage-notice",
            labelKey: "sidebar.noticeManagement",
            path: "/soribaro/manage/notice",
          },
        ],
      },
    ],
  },
];

// 메뉴 아이콘 렌더링 헬퍼
function MenuIcon({ name, size = 16 }) {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) return null;
  return <IconComponent size={size} strokeWidth={1.75} />;
}

// 메뉴 아이템 컴포넌트 (재귀적 렌더링)
function MenuItem({
  item,
  depth = 0,
  expandedItems,
  toggleExpand,
  currentPath,
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  // [프로토타입] 리터럴 label 우선, 없으면 i18n 키
  const label = item.label || t(item.labelKey);
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedItems.includes(item.id);
  const pathMatch = (menuPath) =>
    menuPath &&
    (currentPath === menuPath || currentPath.startsWith(menuPath + "/"));
  const isActive = pathMatch(item.path);

  const isChildActive =
    hasChildren &&
    item.children.some((child) => {
      if (pathMatch(child.path)) return true;
      if (child.children) {
        return child.children.some((grandChild) => pathMatch(grandChild.path));
      }
      return false;
    });

  const handleClick = () => {
    if (hasChildren) {
      toggleExpand(item.id);
    } else if (item.path) {
      if (item.openInNewWindow) {
        window.open(
          toAppUrl(item.path),
          `worktool_${item.id}`,
          "popup,width=1400,height=900",
        );
      } else {
        navigate(item.path);
      }
    }
  };

  // depth-0: 섹션 헤더 스타일
  if (depth === 0) {
    return (
      <div className="menu-section">
        <div
          className={`menu-section-header ${isChildActive ? "child-active" : ""} ${isActive ? "active" : ""}`}
          onClick={handleClick}
        >
          <span className="menu-section-label">{label}</span>
          {hasChildren && (
            <ChevronRight
              size={14}
              strokeWidth={1.75}
              className={`menu-chevron ${isExpanded ? "expanded" : ""}`}
            />
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="menu-section-children">
            {item.children.map((child) => (
              <MenuItem
                key={child.id}
                item={child}
                depth={depth + 1}
                expandedItems={expandedItems}
                toggleExpand={toggleExpand}
                currentPath={currentPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // depth-1: 카테고리 (아이콘 + 텍스트)
  if (depth === 1) {
    return (
      <div className="menu-category">
        <div
          className={`menu-category-item ${isChildActive ? "child-active" : ""} ${isActive ? "active" : ""}`}
          onClick={handleClick}
        >
          <div className="menu-category-content">
            {item.icon && <MenuIcon name={item.icon} size={15} />}
            <span className="menu-category-label">{label}</span>
          </div>
          {hasChildren && (
            <ChevronRight
              size={13}
              strokeWidth={1.75}
              className={`menu-chevron ${isExpanded ? "expanded" : ""}`}
            />
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="menu-category-children">
            {item.children.map((child) => (
              <MenuItem
                key={child.id}
                item={child}
                depth={depth + 1}
                expandedItems={expandedItems}
                toggleExpand={toggleExpand}
                currentPath={currentPath}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // depth-2: 최종 링크
  return (
    <div
      className={`menu-link ${isActive ? "active" : ""}`}
      onClick={handleClick}
    >
      <span className="menu-link-label">{label}</span>
    </div>
  );
}

function SidebarSelect({ value, onChange, options, isCollapsed }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  if (isCollapsed) {
    return (
      <button
        className="sidebar-select-collapsed"
        onClick={() =>
          onChange(
            options[
              (options.findIndex((o) => o.value === value) + 1) % options.length
            ].value,
          )
        }
        title={selected.label}
      >
        {selected.icon}
      </button>
    );
  }

  return (
    <div className="sidebar-select" ref={ref}>
      <button
        className="sidebar-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="sidebar-select-icon">{selected.icon}</span>
        <span className="sidebar-select-label">{selected.label}</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`sidebar-select-chevron ${isOpen ? "open" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="sidebar-select-dropdown">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`sidebar-select-option ${opt.value === value ? "active" : ""}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className="sidebar-select-option-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ isCollapsed, onToggle }) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState(["soribaro"]);

  // 테마 스토어
  const { theme, setTheme } = useThemeStore();

  // 언어 스토어
  const { language, setLanguage } = useLanguageStore();

  // 사용자 스토어
  const user = useUserStore((state) => state.user);
  const logout = useUserStore((state) => state.logout);
  const admin = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    return roles.includes("ROLE_ADMIN") || roles.includes("ROLE_SUPER");
  });
  const traineeOnly = useUserStore((state) => {
    const roles = state.user?.roles ?? [];
    const membLvl = String(state.user?.membLvl ?? "");
    const isAdm =
      roles.includes("ROLE_ADMIN") ||
      roles.includes("ROLE_SUPER") ||
      membLvl === "2" ||
      membLvl === "4";
    const isTrn = roles.includes("ROLE_TRAINEE") || membLvl === "5";
    return isTrn && !isAdm;
  });

  // 모든 depth 에 걸쳐 adminOnly / traineeOnly 항목을 권한에 맞춰 필터.
  // 또한 TRAINEE 전용 모드면 "연수 서비스 / 수강생 페이지" 이외는 완전 숨김.
  const filteredMenuData = useMemo(() => {
    const filterRecursive = (items) =>
      items
        .filter((item) => {
          if (item.adminOnly && !admin) return false;
          // traineeOnly 표시: 수강생일 때만 노출 (관리자는 수강생 페이지 의미 없으므로 숨김)
          if (item.traineeOnly && !traineeOnly) return false;
          // TRAINEE-only 모드면 화이트리스트로 제한
          if (traineeOnly) {
            if (item.id === "soribaro") return true;
            if (item.id === "training-service") return true;
            if (item.id === "training-student") return true;
            return false;
          }
          return true;
        })
        .map((item) => ({
          ...item,
          children: item.children ? filterRecursive(item.children) : undefined,
        }));
    return filterRecursive(menuData);
  }, [admin, traineeOnly]);

  // 현재 경로에 맞춰 메뉴 자동 확장
  useEffect(() => {
    const findExpandableParents = (items, path, parents = []) => {
      for (const item of items) {
        if (
          item.path &&
          (path === item.path || path.startsWith(item.path + "/"))
        ) {
          return parents;
        }
        if (item.children) {
          const result = findExpandableParents(item.children, path, [
            ...parents,
            item.id,
          ]);
          if (result) return result;
        }
      }
      return null;
    };

    const parents = findExpandableParents(filteredMenuData, location.pathname);
    if (parents) {
      setExpandedItems((prev) => {
        const merged = [...new Set([...prev, ...parents])];
        if (
          merged.length === prev.length &&
          merged.every((id, i) => prev[i] === id)
        )
          return prev;
        return merged;
      });
    }
  }, [location.pathname, filteredMenuData]);

  const toggleExpand = (itemId) => {
    if (itemId === "soribaro") return;
    setExpandedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="logo-area">
            <img src={`${import.meta.env.BASE_URL}favicon.ico`} alt="Soribaro" className="logo-icon" />
            <span className="logo-text">Soribaro</span>
          </div>
        )}
        <button
          className="toggle-btn"
          onClick={onToggle}
          title={isCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={18} strokeWidth={1.5} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.5} />
          )}
        </button>
      </div>

      <nav className="sidebar-nav">
        {filteredMenuData.map((item) => (
          <MenuItem
            key={item.id}
            item={item}
            depth={0}
            expandedItems={expandedItems}
            toggleExpand={toggleExpand}
            currentPath={location.pathname}
          />
        ))}
      </nav>

      <div className="sidebar-footer">
        {/* 사용자 정보 */}
        {user && (
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar" title={user.membNm}>
              {user.membNm?.charAt(0) || "?"}
            </div>
            {!isCollapsed && (
              <>
                <div className="sidebar-user-details">
                  <span className="sidebar-user-name">{user.membNm}</span>
                  <span className="sidebar-user-email">{user.membId}</span>
                </div>
                <button
                  className="sidebar-logout-btn"
                  onClick={() => logout()}
                  title={t("sidebar.logout")}
                >
                  <LogOut size={14} strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        )}

        {/* 테마 / 언어 선택 */}
        <div className="sidebar-selects-row">
          <SidebarSelect
            value={theme}
            onChange={setTheme}
            options={Object.entries(THEMES).map(([key, t]) => {
              const ThemeIcon = THEME_ICON_MAP[key] || Monitor;
              return {
                value: key,
                label: t.label,
                icon: <ThemeIcon size={13} strokeWidth={1.75} />,
              };
            })}
            isCollapsed={isCollapsed}
          />
          <SidebarSelect
            value={language}
            onChange={setLanguage}
            options={Object.entries(LANGUAGES).map(([key, lang]) => ({
              value: key,
              label: lang.label,
              icon: (
                <span
                  className={`fi fi-${lang.flag}`}
                  style={{ fontSize: "13px" }}
                />
              ),
            }))}
            isCollapsed={isCollapsed}
          />
        </div>

        {!isCollapsed && (
          <div className="version-info">
            <span>v{__APP_VERSION__}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
