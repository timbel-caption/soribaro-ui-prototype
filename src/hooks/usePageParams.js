import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL searchParams로 page/size를 영속화하는 훅
 * @param {{ pageKey?: string, sizeKey?: string, defaultPage?: number, defaultSize?: number }} options
 * @returns {{ page: number, size: number, setPageParams: (page: number, size?: number) => void }}
 */
export function usePageParams({
  pageKey = 'page',
  sizeKey = 'size',
  defaultPage = 0,
  defaultSize = 20,
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get(pageKey)) || defaultPage;
  const size = Number(searchParams.get(sizeKey)) || defaultSize;

  const setPageParams = useCallback((newPage, newSize) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(pageKey, String(newPage));
      if (newSize !== undefined) next.set(sizeKey, String(newSize));
      return next;
    }, { replace: true });
  }, [setSearchParams, pageKey, sizeKey]);

  return { page, size, setPageParams };
}
