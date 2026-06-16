export default function Pagination({ pagination, onPageChange, onSizeChange, t }) {
  const displayPage = pagination.page + 1;
  const totalPages = pagination.totalPages || 1;

  const pageNumbers = () => {
    const range = 5;
    let start = Math.max(1, displayPage - Math.floor(range / 2));
    let end = Math.min(totalPages, start + range - 1);
    if (end - start + 1 < range) start = Math.max(1, end - range + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="pagination">
      <div className="pagination-size">
        <select value={pagination.size} onChange={(e) => onSizeChange(Number(e.target.value))}>
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{t('manage.common.recordCount', { count: n })}</option>
          ))}
        </select>
      </div>
      <div className="pagination-pages">
        <button disabled={pagination.page <= 0} onClick={() => onPageChange(0)}>&laquo;</button>
        <button disabled={pagination.page <= 0} onClick={() => onPageChange(pagination.page - 1)}>&lsaquo;</button>
        {pageNumbers().map((p) => (
          <button key={p} className={p === displayPage ? 'active' : ''} onClick={() => onPageChange(p - 1)}>{p}</button>
        ))}
        <button disabled={pagination.page >= totalPages - 1} onClick={() => onPageChange(pagination.page + 1)}>&rsaquo;</button>
        <button disabled={pagination.page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)}>&raquo;</button>
      </div>
      <span className="pagination-info">{displayPage} / {totalPages}</span>
    </div>
  );
}
