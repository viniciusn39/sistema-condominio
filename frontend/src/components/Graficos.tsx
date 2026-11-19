import { useEffect, useState } from "react";
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
  type ChartOptions, type TooltipItem,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { agoraBrasilia, formataData, formataPct, porcentagem } from "../formato";
import type { Resultado, Votacao } from "../tipos";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip);
ChartJS.defaults.font.family = '"Inter", system-ui, sans-serif';
ChartJS.defaults.font.size = 12;

// Cores validadas (faixa de luminosidade, croma, separação para daltonismo e contraste) para cada tema.
const CORES = {
  light: { serie: "#4f46e5", destaque: "#d97706", grade: "rgba(15, 23, 42, .07)", texto: "#64748b", tinta: "#0f172a", fundoTooltip: "#0f172a" },
  dark: { serie: "#6366f1", destaque: "#d97706", grade: "rgba(226, 232, 240, .08)", texto: "#94a3b8", tinta: "#e2e8f0", fundoTooltip: "#020617" },
};

/** Acompanha o tema claro/escuro do Bootstrap (atributo data-bs-theme do <html>). */
function useCores() {
  const ler = () => (document.documentElement.getAttribute("data-bs-theme") === "dark" ? CORES.dark : CORES.light);
  const [cores, setCores] = useState(ler);
  useEffect(() => {
    const obs = new MutationObserver(() => setCores(ler()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
    return () => obs.disconnect();
  }, []);
  return cores;
}

function base(c: typeof CORES.light) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.fundoTooltip, padding: 10, cornerRadius: 8, displayColors: false,
        titleFont: { weight: 600 as const }, bodyFont: { size: 12.5 },
      },
    },
  };
}

function eixoValor(c: typeof CORES.light) {
  return {
    beginAtZero: true,
    border: { display: false },
    grid: { color: c.grade, drawTicks: false },
    ticks: { color: c.texto, padding: 8, precision: 0 },
  };
}

function eixoCategoria(c: typeof CORES.light) {
  return { border: { color: c.grade }, grid: { display: false }, ticks: { color: c.tinta, padding: 6 } };
}

const truncar = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

// ---------------------------------------------------------------------
// Resultado de uma votação: barras horizontais por opção (série única)
// ---------------------------------------------------------------------
export function GraficoResultado({ resultado, encerrada }: { resultado: Resultado; encerrada: boolean }) {
  const c = useCores();
  const itens = resultado.itens;
  const cores = itens.map((i) => (encerrada && i.lider ? c.destaque : c.serie));

  const opcoes: ChartOptions<"bar"> = {
    ...base(c),
    indexAxis: "y",
    scales: { x: eixoValor(c), y: { ...eixoCategoria(c), ticks: { ...eixoCategoria(c).ticks, callback(v) { return truncar(String(this.getLabelForValue(Number(v))), 28); } } } },
    plugins: {
      ...base(c).plugins,
      tooltip: {
        ...base(c).plugins.tooltip,
        callbacks: { label: (ctx: TooltipItem<"bar">) => `${ctx.parsed.x} voto(s) · ${formataPct(itens[ctx.dataIndex].pct)}` },
      },
    },
  };

  return (
    <div style={{ height: Math.max(140, itens.length * 46 + 36) }}>
      <Bar
        role="img"
        aria-label={`Resultado: ${itens.map((i) => `${i.texto}, ${i.total} votos`).join("; ")}`}
        options={opcoes}
        data={{
          labels: itens.map((i) => i.texto),
          datasets: [{
            data: itens.map((i) => i.total), backgroundColor: cores, hoverBackgroundColor: cores,
            borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, categoryPercentage: .78,
          }],
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Participação acumulada ao longo do prazo (linha em degraus)
// ---------------------------------------------------------------------
function paraMs(texto: string): number {
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime();
}

function rotuloData(ms: number) {
  const d = new Date(ms);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function GraficoParticipacao({ votacao, horarios, totalUnidades }:
  { votacao: Votacao; horarios: string[]; totalUnidades: number }) {
  const c = useCores();
  const inicio = paraMs(votacao.data_inicio);
  const fimPrazo = paraMs(votacao.encerrada_em ?? votacao.data_fim);
  const agora = paraMs(agoraBrasilia());
  const fim = Math.min(fimPrazo, Math.max(agora, inicio));

  const pontos = [{ x: inicio, y: 0 }];
  [...horarios].map(paraMs).sort((a, b) => a - b).forEach((t, i) => pontos.push({ x: t, y: i + 1 }));
  if (fim > (pontos[pontos.length - 1]?.x ?? 0)) pontos.push({ x: fim, y: horarios.length });

  const opcoes: ChartOptions<"line"> = {
    ...base(c),
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        type: "linear", min: inicio, max: Math.max(fimPrazo, fim), border: { color: c.grade }, grid: { display: false },
        ticks: { color: c.texto, maxTicksLimit: 5, maxRotation: 0, callback: (v) => rotuloData(Number(v)) },
      },
      y: { ...eixoValor(c), max: Math.max(totalUnidades, 1) },
    },
    plugins: {
      ...base(c).plugins,
      tooltip: {
        ...base(c).plugins.tooltip,
        callbacks: {
          title: (itens) => rotuloData(Number(itens[0].parsed.x)),
          label: (ctx) => `${ctx.parsed.y} de ${totalUnidades} unidades (${formataPct(porcentagem(Number(ctx.parsed.y), totalUnidades))})`,
        },
      },
    },
  };

  return (
    <div style={{ height: 220 }}>
      <Line
        role="img"
        aria-label={`Participação acumulada: ${horarios.length} de ${totalUnidades} unidades votaram`}
        options={opcoes}
        data={{
          datasets: [{
            data: pontos, stepped: "before", borderColor: c.serie, borderWidth: 2,
            backgroundColor: c.serie + "1f", fill: "origin",
            pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12,
            pointHoverBackgroundColor: c.serie, pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2,
          }],
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Painel: participação (%) de cada votação recente
// ---------------------------------------------------------------------
export function GraficoParticipacaoVotacoes({ votacoes, totalUnidades }: { votacoes: Votacao[]; totalUnidades: number }) {
  const c = useCores();
  const lista = votacoes.filter((v) => v.estado !== "agendada").slice(0, 8);
  const pcts = lista.map((v) => porcentagem(v.total_votos ?? 0, totalUnidades));

  const opcoes: ChartOptions<"bar"> = {
    ...base(c),
    indexAxis: "y",
    scales: {
      x: { ...eixoValor(c), max: 100, ticks: { ...eixoValor(c).ticks, callback: (v) => `${v}%` } },
      y: { ...eixoCategoria(c), ticks: { ...eixoCategoria(c).ticks, callback(v) { return truncar(String(this.getLabelForValue(Number(v))), 30); } } },
    },
    plugins: {
      ...base(c).plugins,
      tooltip: {
        ...base(c).plugins.tooltip,
        callbacks: {
          title: (itens) => lista[itens[0].dataIndex].titulo,
          label: (ctx) => {
            const v = lista[ctx.dataIndex];
            return `${v.total_votos} de ${totalUnidades} unidades (${formataPct(pcts[ctx.dataIndex])}) · ${formataData(v.data_fim)}`;
          },
        },
      },
    },
  };

  if (!lista.length) return <p className="text-body-secondary small mb-0">O gráfico aparece quando houver votações abertas ou encerradas.</p>;
  return (
    <div style={{ height: lista.length * 44 + 40 }}>
      <Bar
        role="img"
        aria-label={`Participação por votação: ${lista.map((v, i) => `${v.titulo}, ${formataPct(pcts[i])}`).join("; ")}`}
        options={opcoes}
        data={{
          labels: lista.map((v) => v.titulo),
          datasets: [{
            data: pcts, backgroundColor: c.serie, hoverBackgroundColor: c.serie,
            borderRadius: 4, borderSkipped: "start", maxBarThickness: 22, categoryPercentage: .75,
          }],
        }}
      />
    </div>
  );
}
