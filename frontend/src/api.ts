// Cliente da API do Flask. Usa o cookie de sessão e envia o token CSRF nas requisições que alteram dados.

let csrfToken = "";
let aoPerderSessao: (() => void) | null = null;

export function definirCsrf(token: string) {
  csrfToken = token;
}

export function quandoPerderSessao(fn: () => void) {
  aoPerderSessao = fn;
}

export class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

async function requisicao<T>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  if (metodo !== "GET") headers["X-CSRF-Token"] = csrfToken;

  let resp: Response;
  try {
    resp = await fetch(`/api${url}`, {
      method: metodo,
      credentials: "same-origin",
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, "Sem conexão com o servidor. Verifique sua internet.");
  }

  let dados: unknown = null;
  try {
    dados = await resp.json();
  } catch {
    /* resposta sem JSON */
  }
  if (!resp.ok) {
    const erro = (dados as { erro?: string } | null)?.erro ?? "Erro inesperado no servidor.";
    if (resp.status === 401 && url !== "/login") aoPerderSessao?.();
    throw new ErroApi(resp.status, erro);
  }
  return dados as T;
}

export interface RespostaOk {
  mensagem?: string;
}

export const api = {
  get: <T>(url: string) => requisicao<T>("GET", url),
  post: <T = RespostaOk>(url: string, corpo: unknown = {}) => requisicao<T>("POST", url, corpo),
  put: <T = RespostaOk>(url: string, corpo: unknown) => requisicao<T>("PUT", url, corpo),
  del: <T = RespostaOk>(url: string) => requisicao<T>("DELETE", url),
};

/** Envia um arquivo (multipart) com campos extras opcionais. */
export async function enviarArquivo<T>(url: string, arquivo: File, campos: Record<string, string> = {}): Promise<T> {
  const corpo = new FormData();
  corpo.append("arquivo", arquivo);
  Object.entries(campos).forEach(([k, v]) => corpo.append(k, v));
  let resp: Response;
  try {
    resp = await fetch(`/api${url}`, { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrfToken }, body: corpo });
  } catch {
    throw new ErroApi(0, "Sem conexão com o servidor. Verifique sua internet.");
  }
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) throw new ErroApi(resp.status, (dados as { erro?: string } | null)?.erro ?? "Erro inesperado no servidor.");
  return dados as T;
}

export function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : "Erro inesperado.";
}
