"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tableCsv, type CompanyTable } from "@/lib/companies/presentation";

export function CompanyResults({ tables }: { tables: CompanyTable[] }) {
  const download = (table: CompanyTable) => {
    const url = URL.createObjectURL(
      new Blob([tableCsv(table)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      table.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "company-details"
    }.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return tables.map((table, index) => (
    <section key={index} className="my-3" aria-label={table.title}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{table.title}</h3>
        <Button variant="outline" size="sm" onClick={() => download(table)}>
          <DownloadIcon className="size-4" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted">
            <tr>
              {table.headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-2 align-top whitespace-pre-wrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  ));
}
