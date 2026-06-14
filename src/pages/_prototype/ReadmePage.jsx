import { useMemo } from 'react';
import { marked } from 'marked';
// 프로젝트 루트의 README.md 를 원문(raw text)으로 가져옵니다.
import readmeRaw from '../../../README.md?raw';
import './ReadmePage.css';

/**
 * [프로토타입] README 뷰어
 *
 * 프로젝트 루트의 README.md 를 마크다운으로 렌더링해 보여줍니다.
 * README.md 를 수정하면 빌드/HMR 시 자동으로 반영됩니다.
 */
export default function ReadmePage() {
  const html = useMemo(
    () => marked.parse(readmeRaw, { gfm: true, breaks: false }),
    []
  );

  return (
    <div className="readme-page">
      <div
        className="readme-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
