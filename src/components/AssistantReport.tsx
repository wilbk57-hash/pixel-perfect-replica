import { memo, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHART_COLORS = ["#16a34a", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

type ChartSeries = { key: string; label?: string; color?: string };
type ChartSpec = {
  type: "bar" | "line" | "pie";
  title?: string;
  description?: string;
  xKey?: string;
  data: Array<Record<string, unknown>>;
  series?: ChartSeries[];
};

function formatNumber(value: number) {
  return value.toLocaleString("pt-PT");
}

function ReportChart({ spec }: { spec: ChartSpec }) {
  const series: ChartSeries[] =
    spec.series && spec.series.length > 0 ? spec.series : [{ key: "value", label: "Valor" }];

  return (
    <Card className="my-3 border-border/70">
      {(spec.title || spec.description) && (
        <CardHeader className="pb-2">
          {spec.title ? <CardTitle className="text-sm font-semibold">{spec.title}</CardTitle> : null}
          {spec.description ? (
            <p className="text-xs text-muted-foreground">{spec.description}</p>
          ) : null}
        </CardHeader>
      )}
      <CardContent className="pt-0">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {spec.type === "pie" ? (
              <PieChart>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => formatNumber(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Pie
                  data={spec.data}
                  dataKey={series[0]?.key ?? "value"}
                  nameKey={spec.xKey ?? "name"}
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label={(entry: Record<string, unknown>) => String(entry[spec.xKey ?? "name"] ?? "")}
                >
                  {spec.data.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : spec.type === "line" ? (
              <LineChart data={spec.data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis dataKey={spec.xKey ?? "name"} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => formatNumber(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label ?? s.key}
                    stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={spec.data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                <XAxis dataKey={spec.xKey ?? "name"} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number) => formatNumber(value)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label ?? s.key}
                    fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export const AssistantReport = memo(function AssistantReport({ content }: { content: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-base font-bold tracking-tight first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-[15px] font-bold tracking-tight first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          hr: () => <hr className="my-3 border-border" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-hidden rounded-lg border">
              <Table>{children}</Table>
            </div>
          ),
          thead: ({ children }) => <TableHeader className="bg-muted/60">{children}</TableHeader>,
          tbody: ({ children }) => <TableBody>{children}</TableBody>,
          tr: ({ children }) => <TableRow>{children}</TableRow>,
          th: ({ children, style }) => (
            <TableHead
              className="whitespace-nowrap text-xs font-semibold text-foreground"
              style={style as CSSProperties}
            >
              {children}
            </TableHead>
          ),
          td: ({ children, style }) => (
            <TableCell className="text-xs tabular-nums" style={style as CSSProperties}>
              {children}
            </TableCell>
          ),
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            const raw = String(children).replace(/\n$/, "");

            if (lang === "chart") {
              try {
                const spec = JSON.parse(raw) as ChartSpec;
                return <ReportChart spec={spec} />;
              } catch {
                return (
                  <div className="my-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                    Não consegui desenhar este gráfico.
                  </div>
                );
              }
            }

            if (!lang) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
                  {children}
                </code>
              );
            }

            return (
              <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                <code className={className}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
