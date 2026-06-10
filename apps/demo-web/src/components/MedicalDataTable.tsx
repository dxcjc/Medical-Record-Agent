import { Table } from "@arco-design/web-react";
import type { PaginationProps, TableColumnProps, TableProps } from "@arco-design/web-react";
import type { ReactNode } from "react";

export type MedicalTablePagination = Omit<PaginationProps, "showTotal"> & {
  showTotal: (total: number, range?: number[]) => string;
};

type MedicalTablePaginationOptions = Partial<Omit<MedicalTablePagination, "total">>;

export function getMedicalTablePagination(total: number, options: MedicalTablePaginationOptions = {}): MedicalTablePagination {
  const { pageSize = 10, ...restOptions } = options;

  return {
    total,
    pageSize,
    showJumper: true,
    sizeCanChange: true,
    sizeOptions: [10, 20, 50, 100],
    showTotal: (rowCount) => `共 ${rowCount} 条`,
    ...restOptions
  };
}

type MedicalFilterValue = string | number;

type MedicalTextFilterOptions<
  T extends object,
  K extends Extract<keyof T, string>,
  V extends Extract<T[K], MedicalFilterValue>
> = {
  title: ReactNode;
  dataIndex: K;
  values: readonly V[];
  labels?: Partial<Record<V, ReactNode>>;
};

export type MedicalTextFilterColumn<T extends object, V extends MedicalFilterValue> = TableColumnProps<T> & {
  filters: Array<{ text: ReactNode; value: V }>;
  onFilter: (value: V, row: T) => boolean;
};

export function createTextFilterColumn<
  T extends object,
  K extends Extract<keyof T, string> = Extract<keyof T, string>,
  V extends Extract<T[K], MedicalFilterValue> = Extract<T[K], MedicalFilterValue>
>(options: MedicalTextFilterOptions<T, K, V>): MedicalTextFilterColumn<T, V> {
  return {
    title: options.title,
    dataIndex: options.dataIndex,
    key: options.dataIndex,
    filters: options.values.map((value) => ({
      text: options.labels?.[value] ?? String(value),
      value
    })),
    onFilter: (value, row) => row[options.dataIndex] === value
  };
}

export function createNumberSorter<T extends object>(selectValue: (row: T) => number | null | undefined) {
  return (left: T, right: T) => (selectValue(left) ?? 0) - (selectValue(right) ?? 0);
}

type MedicalDataTableProps<T extends object> = Omit<TableProps<T>, "className" | "pagination"> & {
  ariaLabel: string;
  className?: string | string[];
  pageSize?: number;
  pagination?: TableProps<T>["pagination"];
  total?: number;
};

function mergeClassNames(className: string | string[] | undefined) {
  const classNames = Array.isArray(className) ? className : [className];
  return ["medical-data-table", ...classNames].filter(Boolean).join(" ");
}

export function MedicalDataTable<T extends object>({
  ariaLabel,
  className,
  data,
  pageSize,
  pagination,
  scroll,
  total,
  ...tableProps
}: MedicalDataTableProps<T>) {
  const tableData = data ?? [];
  const totalRows = total ?? tableData.length;
  const resolvedPagination =
    pagination === undefined || pagination === true
      ? getMedicalTablePagination(totalRows, pageSize ? { pageSize } : undefined)
      : pagination;

  return (
    <section className={mergeClassNames(className)} aria-label={ariaLabel}>
      <Table<T>
        {...tableProps}
        className="medical-data-table__table"
        data={tableData}
        pagination={resolvedPagination}
        scroll={scroll ?? { x: "max-content" }}
      />
    </section>
  );
}
