'use client';

import React, { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { exportToCsv } from '@/lib/export-csv';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;

interface DataTableProps<T extends { id: string }> {
  columns: ColumnDef<T>[];
  data: T[];
  searchPlaceholder?: string;
  pageSize?: number;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  /** CSV export filename (without extension). When set, shows export button. */
  exportFilename?: string;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  searchPlaceholder = 'Buscar...',
  pageSize: initialPageSize = 30,
  loading = false,
  emptyMessage = 'Nenhum registro encontrado.',
  onRowClick,
  exportFilename,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Filter data based on search across all string fields
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((item) => {
      return Object.values(item as Record<string, unknown>).some((value) => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(term);
        }
        if (typeof value === 'number') {
          return String(value).includes(term);
        }
        return false;
      });
    });
  }, [data, search]);

  // Sort filtered data
  const sortedData = useMemo(() => {
    if (!sort) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sort.key];
      const bVal = (b as Record<string, unknown>)[sort.key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sort.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sort.direction === 'asc' ? 1 : -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const comparison = aVal.localeCompare(bVal, 'pt-BR', { sensitivity: 'base' });
        return sort.direction === 'asc' ? comparison : -comparison;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      const comparison = aStr.localeCompare(bStr, 'pt-BR', { sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sort]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Reset to first page when search changes
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setCurrentPage(0);
    },
    []
  );

  // Toggle sort
  const handleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev?.key === key) {
          if (prev.direction === 'asc') return { key, direction: 'desc' };
          // If already desc, clear sort
          return null;
        }
        return { key, direction: 'asc' };
      });
    },
    []
  );

  const getSortIndicator = (key: string) => {
    if (sort?.key !== key) return ' \u2195';
    return sort.direction === 'asc' ? ' \u2191' : ' \u2193';
  };

  const handleExport = useCallback(
    (allData: boolean) => {
      if (!exportFilename) return;
      const dataToExport = allData ? sortedData : paginatedData;
      const csvColumns = columns.map((col) => ({
        key: col.key,
        header: col.header,
        render: col.render
          ? (item: T) => {
              const node = col.render!(item);
              // Best-effort: extract text from ReactNode
              if (typeof node === 'string' || typeof node === 'number') return String(node);
              const val = (item as Record<string, unknown>)[col.key];
              return val != null ? String(val) : '';
            }
          : undefined,
      }));
      exportToCsv(dataToExport, csvColumns, exportFilename);
    },
    [exportFilename, sortedData, paginatedData, columns],
  );

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: pageSize }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + Export */}
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={handleSearchChange}
          className="max-w-sm"
        />
        {exportFilename && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport(sortedData.length === paginatedData.length)}
            className="gap-1.5 shrink-0"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.sortable && 'cursor-pointer select-none',
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  {col.header}
                  {col.sortable && (
                    <span className="text-xs text-muted-foreground">
                      {getSortIndicator(col.key)}
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item) => (
                <TableRow
                  key={item.id}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(item)
                        : String(
                            (item as Record<string, unknown>)[col.key] ?? ''
                          )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Mostrando {Math.min(currentPage * pageSize + 1, sortedData.length)} a{' '}
            {Math.min((currentPage + 1) * pageSize, sortedData.length)} de{' '}
            {sortedData.length} registros
          </p>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Exibir:</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(0);
              }}
            >
              <SelectTrigger className="h-7 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {sortedData.length > pageSize && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {currentPage + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage >= totalPages - 1}
            >
              Próximo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
