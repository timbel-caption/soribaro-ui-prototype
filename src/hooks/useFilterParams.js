import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL searchParams 와 단방향 동기화되는 필터 state 훅.
 *
 * 동작:
 * - 마운트 시점에 URL 쿼리에서 각 키 값을 읽어 초기 filters 구성. 없으면 defaults 사용.
 * - setFilter / setFilters 는 useState 만 갱신 (URL 즉시 동기화하지 않음 — 입력 중 URL 깜박임 방지).
 * - commit(overrides?) 호출 시 현재 filters + overrides 를 URL 에 한 번의 setSearchParams 로 반영.
 * - reset(overrides?) 호출 시 filters 를 defaults 로 되돌리고 URL 에서 필터 키 제거 + overrides 적용.
 *
 * 왜 overrides? — react-router-dom 의 setSearchParams 는 같은 렌더에서 두 번 호출 시
 * 두 번째 호출의 prev 가 첫 번째 결과를 반영하지 않아(클로저 캡처) 첫 결과가 손실된다.
 * page/size 같이 같이 갱신할 키는 overrides 로 한 번에 넘겨야 안전.
 *
 * 사용 패턴 (검색 페이지):
 *   const defaults = useMemo(() => ({ startDate: '...', endDate: '...', ... }), []);
 *   const { filters, setFilter, commit, reset } = useFilterParams(defaults);
 *   const handleSearch = () => { commit({ page: 0, size: pagination.size }); fetchData(0); };
 *   const handleReset = () => { reset({ page: 0 }); ... };
 *
 * 뒤로가기로 컴포넌트가 재마운트되면 URL 에 남아있는 값으로 자동 복원된다.
 *
 * @param {Object} defaults — 기본 필터 값. 키 목록과 빈 상태 결정에 사용.
 * @returns {{ filters, setFilter, setFilters, commit, reset }}
 */
export function useFilterParams(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();
  const keys = useMemo(() => Object.keys(defaults), [defaults]);

  const [filters, setFiltersState] = useState(() => {
    const initial = { ...defaults };
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v != null) initial[k] = v;
    }
    return initial;
  });

  const setFilter = useCallback((key, value) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFilters = useCallback((next) => {
    setFiltersState((prev) => ({ ...prev, ...next }));
  }, []);

  const applyOverrides = (next, overrides) => {
    if (!overrides) return;
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
  };

  const commit = useCallback((overrides) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of keys) {
        const v = filters[k];
        if (v == null || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      applyOverrides(next, overrides);
      return next;
    }, { replace: true });
  }, [setSearchParams, keys, filters]);

  const reset = useCallback((overrides) => {
    setFiltersState({ ...defaults });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const k of keys) next.delete(k);
      applyOverrides(next, overrides);
      return next;
    }, { replace: true });
  }, [setSearchParams, keys, defaults]);

  return { filters, setFilter, setFilters, commit, reset };
}
