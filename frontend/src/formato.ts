import type { Estado } from "./tipos";

export const ROTULO_ESTADO: Record<Estado, string> = {
  agendada: "Agendada",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

/** "2026-11-11T10:00" ou "2026-11-11 10:00:00" → "11/11/2026 10:00" (já está no horário do condomínio) */
export function formataData(texto: string | null | undefined): string {
  if (!texto) return "";
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : texto;
}

export function duracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dois = (n: number) => String(n).padStart(2, "0");
  if (d) return `${d}d ${dois(h)}h ${dois(m)}min`;
  if (h) return `${h}h ${dois(m)}min`;
  return `${m}min ${dois(seg)}s`;
}

export function porcentagem(parte: number, todo: number): number {
  return todo ? (100 * parte) / todo : 0;
}

export function formataPct(pct: number): string {
  return pct.toFixed(1).replace(".", ",") + "%";
}

/** Data/hora atual em Brasília no formato do campo datetime-local. */
export function agoraBrasilia(somarDias = 0): string {
  const d = new Date(Date.now() + somarDias * 86400000);
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/* ---------- máscaras de documentos e contato ---------- */
export const soDigitos = (t: string) => (t || "").replace(/\D/g, "");

function aplica(digitos: string, molde: string) {
  let i = 0;
  let saida = "";
  for (const c of molde) {
    if (i >= digitos.length) break;
    saida += c === "#" ? digitos[i++] : c;
  }
  return saida;
}

export const mascaraCpf = (t: string) => aplica(soDigitos(t).slice(0, 11), "###.###.###-##");
export const mascaraCnpj = (t: string) => aplica(soDigitos(t).slice(0, 14), "##.###.###/####-##");
export const mascaraCep = (t: string) => aplica(soDigitos(t).slice(0, 8), "#####-###");
export function mascaraTelefone(t: string) {
  const d = soDigitos(t).slice(0, 11);
  return d.length > 10 ? aplica(d, "(##) #####-####") : aplica(d, "(##) ####-####");
}

export function cpfValido(t: string) {
  const c = soDigitos(t);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(c[n])) return false;
  }
  return true;
}

export function cnpjValido(t: string) {
  const c = soDigitos(t);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  for (const n of [12, 13]) {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(c[i]) * p, 0);
    const dv = 11 - (soma % 11);
    if ((dv >= 10 ? 0 : dv) !== Number(c[n])) return false;
  }
  return true;
}
