import { describe, expect, it } from "vitest";

import { createNumberSorter, createTextFilterColumn, getMedicalTablePagination } from "./MedicalDataTable";

type DemoRow = {
  id: string;
  risk: "high" | "medium" | "low";
  score: number;
};

describe("MedicalDataTable helpers", () => {
  it("provides a consistent paginated table default", () => {
    const pagination = getMedicalTablePagination(42);

    expect(pagination).toMatchObject({
      total: 42,
      pageSize: 10,
      showJumper: true,
      sizeCanChange: true
    });
    expect(pagination.showTotal?.(42)).toBe("共 42 条");
  });

  it("creates text filters with labels and exact-match filtering", () => {
    const column = createTextFilterColumn<DemoRow>({
      title: "风险",
      dataIndex: "risk",
      values: ["high", "low"],
      labels: {
        high: "高风险",
        low: "低风险"
      }
    });

    expect(column.filters).toEqual([
      { text: "高风险", value: "high" },
      { text: "低风险", value: "low" }
    ]);
    expect(column.onFilter?.("high", { id: "A", risk: "high", score: 92 })).toBe(true);
    expect(column.onFilter?.("high", { id: "B", risk: "low", score: 50 })).toBe(false);
  });

  it("creates numeric sorters for table columns", () => {
    const sorter = createNumberSorter<DemoRow>((row) => row.score);

    expect(sorter({ id: "A", risk: "high", score: 92 }, { id: "B", risk: "low", score: 50 })).toBe(42);
  });
});
