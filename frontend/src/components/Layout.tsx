import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Dropdown, Offcanvas } from "react-bootstrap";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { destinoInicial, useAuth } from "../auth";
import { iniciais, primeiroNome } from "../formato";
import { useFeedback } from "./Feedback";
import { Carregando, Icone, Marca } from "./ui";

/** Evento disparado pela página de avisos quando o usuário lê os avisos (atualiza o sino). */
export const EVENTO_AVISOS = "quorum:avisos";

/** Exige login, um condomínio atual (salvo nas telas de boas-vindas) e, opcionalmente, ser síndico. */
export function Protegido({ admin = false, semCondominio = false }: { admin?: boolean; semCondominio?: boolean }) {
  const { usuario, condominioAtual, carregando } = useAuth();
  const local = useLocation();
  if (carregando) return <Carregando />;
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />;
  if (!semCondominio && !condominioAtual) return <Navigate to="/bem-vindo" replace />;
  if (admin && usuario.perfil !== "admin") return <Navigate to="/votacoes" replace />;
  return <Outlet />;
}

/** Menu lateral escuro, fixo no desktop e em gaveta no celular. */
function MenuLateral({ naoLidos }: { naoLidos: number }) {
  const { usuario, condominio } = useAuth();
  if (!usuario) return null;
  const admin = usuario.perfil === "admin";

  const item = (para: string, icone: string, rotulo: string, extra?: React.ReactNode, end = false) => (
    <NavLink to={para} end={end} className="app-menu-link">
      <Icone nome={icone} tamanho={18} /> <span className="flex-grow-1">{rotulo}</span> {extra}
    </NavLink>
  );

  return (
    <div className="app-lateral-corpo">
      <div className="app-lateral-topo">
        <Link to={admin ? "/admin" : "/votacoes"} className="marca"><Marca condominio={condominio} /></Link>
      </div>

      <nav className="app-menu" aria-label="Menu principal">
        <div className="app-menu-grupo">Condomínio</div>
        {item("/votacoes", "urna", "Votações")}
        {item("/avisos", "sino", "Mural de avisos",
          naoLidos > 0 ? <Badge pill bg="primary" className="tabular">{naoLidos}</Badge> : null)}
        {item("/documentos", "documento", "Documentos")}
        {admin && (
          <>
            <div className="app-menu-grupo">Administração</div>
            {item("/admin", "grafico", "Painel", null, true)}
            {item("/admin/votacoes/nova", "mais", "Nova votação")}
            {item("/admin/moradores", "usuarios", "Moradores")}
            {item("/admin/mapa", "mapa", "Mapa do condomínio")}
            {item("/admin/unidades", "predio", "Unidades")}
            {item("/admin/importar", "upload", "Importar planilha")}
            {item("/admin/condominio", "casa", "Dados do condomínio")}
          </>
        )}
      </nav>

      <div className="app-lateral-rodape small">
        <div className="d-flex align-items-center gap-2 text-body-secondary px-2">
          <Icone nome="relogio" tamanho={15} /> Horários de Brasília
        </div>
      </div>
    </div>
  );
}

/** Barra superior: menu (celular), sino de avisos, tema e conta. */
function BarraTopo({ naoLidos, abrirMenu }: { naoLidos: number; abrirMenu: () => void }) {
  const { usuario, condominio, condominioAtual, condominios, sair, trocarCondominio } = useAuth();
  const { avisar } = useFeedback();
  const navegar = useNavigate();
  const [escuro, setEscuro] = useState(() => document.documentElement.getAttribute("data-bs-theme") === "dark");
  if (!usuario) return null;
  const admin = usuario.perfil === "admin";

  const alternarTema = () => {
    const novo = escuro ? "light" : "dark";
    document.documentElement.setAttribute("data-bs-theme", novo);
    try { localStorage.setItem("tema", novo); } catch { /* navegação privada */ }
    setEscuro(!escuro);
  };

  const trocar = async (id: number) => {
    if (id === condominioAtual?.id) return;
    try {
      const s = await trocarCondominio(id);
      avisar(`Você está no ${s.condominio}.`, "info");
      navegar(destinoInicial(s));
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível trocar de condomínio.", "erro");
    }
  };

  const fazerLogout = async () => {
    await sair();
    avisar("Você saiu do sistema.", "info");
    navegar("/entrar");
  };

  return (
    <header className="app-topo">
      <Button variant="link" className="p-1 text-body d-lg-none" onClick={abrirMenu} aria-label="Abrir menu">
        <Icone nome="menu" tamanho={22} />
      </Button>
      <Link to="/votacoes" className="marca d-lg-none"><Marca /></Link>
      <Dropdown className="d-none d-lg-block">
        <Dropdown.Toggle as="button" className="app-condominio" id="menu-condominio">
          <Icone nome="predio" tamanho={16} />
          <span className="text-truncate">{condominio}</span>
          {condominioAtual?.cidade && <span className="text-body-secondary fw-normal d-none d-xl-inline">· {condominioAtual.cidade}/{condominioAtual.uf}</span>}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
        </Dropdown.Toggle>
        <Dropdown.Menu style={{ minWidth: 280 }}>
          <Dropdown.Header>Seus condomínios</Dropdown.Header>
          {condominios.map((c) => (
            <Dropdown.Item key={c.id} as="button" active={c.id === condominioAtual?.id} onClick={() => trocar(c.id)}>
              <div className="d-flex justify-content-between gap-3">
                <span className="text-truncate">{c.nome}</span>
                <span className="small opacity-75">{c.papel === "sindico" ? "Síndico" : "Morador"}</span>
              </div>
              {c.cidade && <div className="small opacity-75">{c.cidade}/{c.uf}</div>}
            </Dropdown.Item>
          ))}
          <Dropdown.Divider />
          <Dropdown.Item as={Link} to="/condominios/novo"><Icone nome="mais" tamanho={16} /> Cadastrar outro condomínio</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <div className="ms-auto d-flex align-items-center gap-1">
        <Link to="/avisos" className="app-topo-botao position-relative" aria-label={`Avisos${naoLidos ? `, ${naoLidos} novos` : ""}`}>
          <Icone nome="sino" tamanho={19} />
          {naoLidos > 0 && <span className="app-topo-ponto">{naoLidos > 9 ? "9+" : naoLidos}</span>}
        </Link>
        <button type="button" className="app-topo-botao d-none d-sm-inline-grid" onClick={alternarTema}
                aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"} title={escuro ? "Tema claro" : "Tema escuro"}>
          <Icone nome={escuro ? "sol" : "lua"} tamanho={18} />
        </button>
        <span className="app-topo-divisor d-none d-sm-block" />
        <Dropdown align="end">
          <Dropdown.Toggle as="button" className="app-conta" id="menu-conta">
            <span className="avatar">{iniciais(usuario.nome)}</span>
            <span className="d-none d-md-block text-start lh-sm">
              <span className="d-block fw-semibold small">{primeiroNome(usuario.nome)}</span>
              <span className="d-block text-body-secondary" style={{ fontSize: ".72rem" }}>{admin ? "Síndico" : "Morador"}</span>
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ minWidth: 240 }}>
            <div className="px-3 py-2 small">
              <div className="fw-semibold">{usuario.nome}</div>
              <div className="text-body-secondary text-truncate">{usuario.email}</div>
            </div>
            <Dropdown.Divider />
            {condominios.length > 1 && (
              <div className="d-lg-none">
                <Dropdown.Header>Trocar de condomínio</Dropdown.Header>
                {condominios.map((c) => (
                  <Dropdown.Item key={c.id} as="button" active={c.id === condominioAtual?.id} onClick={() => trocar(c.id)}>{c.nome}</Dropdown.Item>
                ))}
                <Dropdown.Divider />
              </div>
            )}
            <Dropdown.Item as={Link} to="/condominios/novo" className="d-lg-none"><Icone nome="mais" tamanho={16} /> Cadastrar condomínio</Dropdown.Item>
            <Dropdown.Item as={Link} to="/conta/senha"><Icone nome="chave" tamanho={16} /> Trocar senha</Dropdown.Item>
            <Dropdown.Item as="button" className="d-sm-none" onClick={alternarTema}>
              <Icone nome={escuro ? "sol" : "lua"} tamanho={16} /> {escuro ? "Tema claro" : "Tema escuro"}
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item as="button" onClick={fazerLogout}><Icone nome="sair" tamanho={16} /> Sair</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  );
}

export function LayoutApp() {
  const { usuario } = useAuth();
  const [gaveta, setGaveta] = useState(false);
  const [naoLidos, setNaoLidos] = useState(0);
  const { pathname } = useLocation();

  const contarAvisos = useCallback(() => {
    api.get<{ nao_lidos: number }>("/avisos/nao-lidos").then((r) => setNaoLidos(r.nao_lidos)).catch(() => {});
  }, []);

  // fecha a gaveta do celular e atualiza o sino ao trocar de página
  useEffect(() => { setGaveta(false); contarAvisos(); }, [pathname, contarAvisos]);
  useEffect(() => {
    window.addEventListener(EVENTO_AVISOS, contarAvisos);
    return () => window.removeEventListener(EVENTO_AVISOS, contarAvisos);
  }, [contarAvisos]);

  if (!usuario) return null;

  return (
    <>
      <aside className="app-lateral d-none d-lg-flex" data-bs-theme="dark"><MenuLateral naoLidos={naoLidos} /></aside>

      <Offcanvas show={gaveta} onHide={() => setGaveta(false)} className="app-gaveta d-lg-none" data-bs-theme="dark" aria-label="Menu">
        <MenuLateral naoLidos={naoLidos} />
      </Offcanvas>

      <div className="app-conteudo">
        <BarraTopo naoLidos={naoLidos} abrirMenu={() => setGaveta(true)} />
        <main className="app-main">
          <Outlet />
        </main>
        <footer className="app-rodape d-flex flex-wrap justify-content-between gap-2">
          <span>Votação identificada · 1 voto por unidade</span>
          <span>Horários de Brasília</span>
        </footer>
      </div>
    </>
  );
}
