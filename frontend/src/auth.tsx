import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, definirCsrf, quandoPerderSessao } from "./api";
import { PRODUTO } from "./marca";
import type { CondominioResumo, Sessao, Usuario } from "./tipos";

interface Auth {
  usuario: Usuario | null;
  /** nome do condomínio atual ("" se a pessoa ainda não participa de nenhum) */
  condominio: string;
  condominioAtual: CondominioResumo | null;
  condominios: CondominioResumo[];
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<Sessao>;
  sair: () => Promise<void>;
  /** aplica a sessão devolvida pelo servidor (login, cadastro, troca de condomínio) */
  aplicar: (s: Sessao) => void;
  trocarCondominio: (id: number) => Promise<Sessao>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const aplicar = useCallback((s: Sessao) => {
    definirCsrf(s.csrf);
    setSessao(s);
  }, []);

  useEffect(() => {
    quandoPerderSessao(() => setSessao((s) => (s ? { ...s, usuario: null, condominio_atual: null, condominios: [] } : s)));
    api.get<Sessao>("/sessao").then(aplicar).catch(() => setSessao(null)).finally(() => setCarregando(false));
  }, [aplicar]);

  const condominio = sessao?.usuario ? sessao.condominio : "";
  useEffect(() => {
    document.title = condominio ? `${PRODUTO} · ${condominio}` : `${PRODUTO} · Assembleias online`;
  }, [condominio]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const s = await api.post<Sessao>("/login", { email, senha });
    aplicar(s);
    return s;
  }, [aplicar]);

  const sair = useCallback(async () => {
    try {
      const r = await api.post<{ csrf: string }>("/logout");
      definirCsrf(r.csrf);
    } finally {
      setSessao((s) => (s ? { ...s, usuario: null, condominio: "", condominio_atual: null, condominios: [] } : s));
    }
  }, []);

  const trocarCondominio = useCallback(async (id: number) => {
    const s = await api.post<Sessao>(`/condominios/${id}/entrar`);
    aplicar(s);
    return s;
  }, [aplicar]);

  return (
    <AuthContext.Provider value={{
      usuario: sessao?.usuario ?? null, condominio, condominioAtual: sessao?.condominio_atual ?? null,
      condominios: sessao?.condominios ?? [], carregando, entrar, sair, aplicar, trocarCondominio,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

/** Para onde mandar a pessoa depois de entrar. */
export function destinoInicial(s: { usuario: Usuario | null; condominio_atual?: CondominioResumo | null }) {
  if (!s.usuario) return "/entrar";
  if (!s.condominio_atual) return "/bem-vindo";
  return s.usuario.perfil === "admin" ? "/admin" : "/votacoes";
}
