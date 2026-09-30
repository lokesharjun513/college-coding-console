import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/components.css';
import '../../styles/components/table.css';
import Skeleton from './Skeleton';

/**
 * DataTable – simple table with optional S.No. column and compact styling.
 */
export default function DataTable({
  columns,
  data,
  loading,
  error,
  emptyMessage,
  showSNo = false,
  currentPage = 1,
  pageSize = 10,
}) {
  // Build column definitions with optional S.No.
  const allColumns = showSNo
    ? [{ key: '_sNo', header: 'S.No.', align: 'center' }, ...columns]
    : columns;

  // Helper to compute S.No. for a given row index
  const getSerialNumber = (rowIndex) => {
    return (currentPage - 1) * pageSize + rowIndex + 1;
  };

  if (loading) {
    const skeletonRows = Array.from({ length: 3 }).map((_, i) => (
      <tr key={i}>
        {allColumns.map((col) => (
          <td key={col.key}>
            <Skeleton width="80%" height="var(--space-4)" />
          </td>
        ))}
      </tr>
    ));
    return (
      <div className="table-container">
        <table className="table table--compact">
          <thead>
            <tr>
              {allColumns.map((col) => (
                <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{skeletonRows}</tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return <div className="table-container" style={{ color: 'var(--color-danger)' }}>{error}</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-container">
        <table className="table table--compact">
          <thead>
            <tr>
              {allColumns.map((col) => (
                <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={allColumns.length} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                {emptyMessage || 'No data available.'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table table--compact">
        <thead>
          <tr>
            {allColumns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align || 'left' }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {allColumns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align || (col.key === '_sNo' ? 'center' : 'left'),
                    color: col.key === '_sNo' ? 'var(--color-text-muted)' : undefined,
                    fontSize: col.key === '_sNo' ? '13px' : undefined,
                    fontWeight: col.key === '_sNo' ? 500 : undefined,
                    width: col.key === '_sNo' ? '60px' : undefined,
                  }}
                >
                  {col.key === '_sNo'
                    ? getSerialNumber(rowIdx)
                    : col.formatter
                    ? col.formatter(row[col.key], row)
                    : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

DataTable.propTypes = {
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      header: PropTypes.string.isRequired,
      formatter: PropTypes.func,
      align: PropTypes.oneOf(['left', 'center', 'right']),
    })
  ).isRequired,
  data: PropTypes.arrayOf(PropTypes.object),
  loading: PropTypes.bool,
  error: PropTypes.string,
  emptyMessage: PropTypes.string,
  showSNo: PropTypes.bool,
  currentPage: PropTypes.number,
  pageSize: PropTypes.number,
};
