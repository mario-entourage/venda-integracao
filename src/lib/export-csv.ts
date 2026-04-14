/**
 * Generate and download a CSV file from an array of objects.
 *
 * @param rows    - The data to export
 * @param columns - Column definitions: { key, header }. `key` is the object
 *                  property name, `header` is the CSV column header.
 * @param filename - Name of the downloaded file (without extension)
 */
export function exportToCsv<T>(
  rows: T[],
  columns: { key: string; header: string; render?: (item: T) => string }[],
  filename: string,
): void {
  if (rows.length === 0) return;

  const escape = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const headerRow = columns.map((c) => escape(c.header)).join(',');

  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        if (col.render) return escape(col.render(row));
        const val = (row as Record<string, unknown>)[col.key];
        if (val == null) return '';
        return escape(String(val));
      })
      .join(','),
  );

  // BOM for Excel UTF-8 support
  const bom = '\uFEFF';
  const csvContent = bom + [headerRow, ...dataRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
