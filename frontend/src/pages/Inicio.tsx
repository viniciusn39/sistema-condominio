import { useEffect, useState } from "react";
import { Accordion, Card, Col, Container, Nav, Navbar, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import PreviaMapa from "../components/PreviaMapa";
import { Icone, Marca } from "../components/ui";
import { PRODUTO } from "../marca";

const RECURSOS = [
  { icone: "urna", titulo: "Um voto por unidade", texto: "Cada apartamento tem um único votante: o proprietário ou um representante indicado por ele. Quem tem mais de uma unidade vota por cada uma." },
  { icone: "relogio", titulo: "Prazo com hora marcada", texto: "A votação abre e encerra sozinha nos horários definidos pelo síndico. Ninguém precisa lembrar de fechar a urna." },
  { icone: "grafico", titulo: "Apuração em tempo real", texto: "O síndico acompanha a participação enquanto a votação corre. Os moradores veem o resultado assim que o prazo termina." },
  { icone: "documento", titulo: "Pronto para a ata", texto: "Cada voto fica registrado com unidade, votante, escolha, data e hora, e pode ser exportado em planilha." },
  { icone: "celular", titulo: "Celular ou computador", texto: "Nada para instalar. Funciona no navegador de qualquer aparelho, com letras grandes e poucos cliques." },
  { icone: "escudo", titulo: "Acesso controlado", texto: "Só entra quem foi cadastrado pela administração. Senhas protegidas e sessão com proteção contra fraudes." },
];

const PASSOS = [
  { titulo: "O síndico publica a pauta", texto: "Com a descrição, as opções de voto e o período em que a votação fica aberta." },
  { titulo: "Os moradores votam", texto: "Entram com e-mail e senha, escolhem a opção e confirmam. Leva menos de um minuto." },
  { titulo: "O resultado sai no horário", texto: "A votação encerra sozinha e o resultado fica disponível para todos, com gráfico." },
];

const DUVIDAS = [
  { p: "Quem pode votar?", r: "O proprietário da unidade ou um representante indicado por ele. Cada apartamento tem um único votante cadastrado, definido pela administração a pedido do proprietário." },
  { p: "Moro de aluguel. Posso votar?", r: "Pode, se o proprietário indicar você como representante da unidade. Basta ele avisar a administração." },
  { p: "Dá para mudar o voto depois?", r: "Não. O voto fica registrado com data e hora no momento da confirmação, como numa assembleia presencial. Por isso o sistema sempre pede uma confirmação antes." },
  { p: "Quando eu vejo o resultado?", r: "Assim que a votação encerra. Enquanto ela está aberta, só a administração acompanha a apuração parcial, para não influenciar quem ainda vai votar." },
  { p: "O voto é secreto?", r: "Não. O voto é identificado: fica registrado o que cada unidade escolheu, para constar na ata e permitir conferência. Os outros moradores veem apenas o resultado consolidado." },
  { p: "Esqueci minha senha.", r: "Peça à administração para redefinir. Depois de entrar, você pode trocá-la quando quiser no menu da sua conta." },
];

export default function Inicio() {
  const { usuario, condominio } = useAuth();
  const destino = usuario ? (usuario.perfil === "admin" ? "/admin" : "/votacoes") : "/entrar";
  const ano = new Date().getFullYear();

  return (
    <>
      <Navbar expand="sm" className="s-topo py-2" data-bs-theme="dark">
        <Container>
          <Navbar.Brand as={Link} to="/"><Marca condominio={condominio} /></Navbar.Brand>
          <Nav className="ms-auto flex-row align-items-center gap-2 gap-md-4">
            <Nav.Link href="#recursos" className="d-none d-md-block">Recursos</Nav.Link>
            <Nav.Link href="#como-funciona" className="d-none d-md-block">Como funciona</Nav.Link>
            <Nav.Link href="#duvidas" className="d-none d-md-block">Dúvidas</Nav.Link>
            <Link to={destino} className="btn btn-primary btn-sm px-3">{usuario ? "Abrir o sistema" : "Entrar"}</Link>
          </Nav>
        </Container>
      </Navbar>

      <main>
        <section className="s-heroi">
          <Container className="position-relative py-5">
            <Row className="align-items-center gy-5 py-lg-5">
              <Col lg={6} className="pe-lg-4">
                <span className="s-selo mb-4"><span>Online</span> {condominio ? `Assembleia do ${condominio}` : "Assembleias para condomínios"}</span>
                <h1 className="s-titulo mt-4 mb-4">
                  As decisões do prédio, <em>votadas de casa.</em>
                </h1>
                <p className="fs-5 text-body-secondary mb-4" style={{ maxWidth: "32em" }}>
                  Pautas abertas por alguns dias, um voto por apartamento e resultado publicado
                  automaticamente no fim do prazo. Sem salão vazio, sem papel.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <a href="#recursos" className="btn btn-primary btn-lg">
                    Conheça os recursos <Icone nome="seta" tamanho={18} />
                  </a>
                  <a href="#como-funciona" className="btn btn-outline-secondary btn-lg">Como funciona</a>
                </div>
                <p className="small text-body-secondary mt-4 mb-0">
                  Acesso apenas para moradores cadastrados pela administração do condomínio.
                </p>
              </Col>
              <Col lg={6}>
                <div className="position-relative ms-lg-3"><PreviaProduto /></div>
              </Col>
            </Row>
          </Container>
        </section>

        <section id="recursos" className="s-secao">
          <Container>
            <div className="text-center mx-auto mb-5" style={{ maxWidth: 620 }}>
              <div className="s-rotulo mb-2">Recursos</div>
              <h2 className="s-secao-titulo mb-3">Tudo o que uma assembleia precisa, sem a reunião</h2>
              <p className="text-body-secondary mb-0">O mesmo rito da assembleia presencial, com prazo de alguns dias em vez de uma noite no salão.</p>
            </div>
            <Row xs={1} md={2} lg={3} className="g-3 g-lg-4">
              {RECURSOS.map((r) => (
                <Col key={r.titulo}>
                  <Card className="s-recurso">
                    <Card.Body className="p-4">
                      <span className="numero-icone"><Icone nome={r.icone} tamanho={20} /></span>
                      <h3 className="h6 fs-6 fw-semibold mb-2">{r.titulo}</h3>
                      <p className="small text-body-secondary mb-0">{r.texto}</p>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          </Container>
        </section>

        <section id="mapa" className="s-secao s-secao-mapa">
          <Container>
            <Row className="gy-5 align-items-center">
              <Col lg={4}>
                <div className="s-rotulo mb-2">Mapa do condomínio</div>
                <h2 className="s-secao-titulo mb-3">Veja, prédio por prédio, quem já está no sistema</h2>
                <p className="text-body-secondary mb-4">
                  Cada apartamento aparece no desenho do bloco com a sua situação. O síndico sabe na hora quem falta
                  cadastrar, quem recebeu o acesso e nunca entrou e quais unidades estão vagas.
                </p>
                <ul className="list-unstyled d-grid gap-2 mb-0 small">
                  {["Clique no apartamento para ver o proprietário e quem vota", "Destaque quem já votou na última votação",
                    "Filtre pela situação e cobre só quem falta"].map((t) => (
                    <li key={t} className="d-flex gap-2 align-items-start">
                      <span className="text-success-emphasis mt-1"><Icone nome="check" tamanho={15} /></span>{t}
                    </li>
                  ))}
                </ul>
              </Col>
              <Col lg={8}><PreviaMapa /></Col>
            </Row>
          </Container>
        </section>

        <section id="como-funciona" className="s-secao bg-body border-top border-bottom" style={{ background: "var(--q-superficie)" }}>
          <Container>
            <Row className="gy-5 align-items-center">
              <Col lg={5}>
                <div className="s-rotulo mb-2">Como funciona</div>
                <h2 className="s-secao-titulo mb-3">Três passos, do edital ao resultado</h2>
                <p className="text-body-secondary mb-0">O síndico cuida da configuração uma vez. Depois, cada votação leva poucos minutos para ser criada.</p>
              </Col>
              <Col lg={{ span: 6, offset: 1 }}>
                <ol className="list-unstyled d-grid gap-4 mb-0">
                  {PASSOS.map((p, i) => (
                    <li key={p.titulo} className="d-flex gap-3">
                      <span className="s-passo-num">{i + 1}</span>
                      <div>
                        <h3 className="h6 fw-semibold mb-1">{p.titulo}</h3>
                        <p className="text-body-secondary mb-0">{p.texto}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Col>
            </Row>
          </Container>
        </section>

        <section id="duvidas" className="s-secao">
          <Container style={{ maxWidth: 820 }}>
            <div className="text-center mb-4">
              <div className="s-rotulo mb-2">Dúvidas</div>
              <h2 className="s-secao-titulo">Perguntas frequentes</h2>
            </div>
            <Accordion flush className="s-faq border-top">
              {DUVIDAS.map((d, i) => (
                <Accordion.Item eventKey={String(i)} key={d.p}>
                  <Accordion.Header as="h3">{d.p}</Accordion.Header>
                  <Accordion.Body>{d.r}</Accordion.Body>
                </Accordion.Item>
              ))}
            </Accordion>
          </Container>
        </section>

      </main>

      <footer className="s-rodape" data-bs-theme="dark">
        <Container>
          <Row className="gy-5 py-5">
            <Col lg={5} className="pe-lg-5">
              <Marca condominio={condominio} />
              <p className="s-rodape-texto mt-3 mb-4">
                Assembleias online para condomínios: pautas com prazo definido, um voto por unidade e
                resultado publicado automaticamente no encerramento.
              </p>
              <div className="d-flex flex-wrap gap-2">
                <span className="s-rodape-selo"><Icone nome="documento" tamanho={14} /> Lei 14.309/2022</span>
                <span className="s-rodape-selo"><Icone nome="escudo" tamanho={14} /> Conexão segura (HTTPS)</span>
                <span className="s-rodape-selo"><Icone nome="check" tamanho={14} /> Voto registrado para a ata</span>
              </div>
            </Col>
            <Col xs={6} md={4} lg={2}>
              <h3 className="s-rodape-titulo">Conheça</h3>
              <ul className="list-unstyled s-rodape-links">
                <li><a href="#recursos">Recursos</a></li>
                <li><a href="#como-funciona">Como funciona</a></li>
                <li><a href="#duvidas">Perguntas frequentes</a></li>
              </ul>
            </Col>
            <Col md={6} lg={4} className="ms-lg-auto">
              <h3 className="s-rodape-titulo">Precisa de ajuda?</h3>
              <p className="s-rodape-texto small mb-0">
                O acesso é criado pela administração do condomínio. Se esqueceu a senha ou ainda não recebeu
                o seu login, fale com o síndico ou com a portaria.
              </p>
            </Col>
          </Row>
          <div className="s-rodape-base d-flex flex-wrap justify-content-between gap-2 py-4">
            <span>© {ano} {PRODUTO}. Todos os direitos reservados.</span>
            <span>Horários em Brasília (GMT-3)</span>
          </div>
        </Container>
      </footer>
    </>
  );
}

/** Ilustração do painel do síndico feita em HTML (nítida em qualquer tela e nos dois temas). */
const APTOS_DEMO = ["302", "101", "1204", "57", "803", "410", "22", "1501", "605", "903"];
const INICIO_DEMO = [26, 8, 4];   // Aprovo, Reprovo, Abstenção
const UNIDADES_DEMO = 48;

/** Votos "chegando" na prévia; para quem prefere menos movimento, fica no estado final. */
function useVotosDemo() {
  const parado = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [votos, setVotos] = useState(parado ? [31, 9, 4] : INICIO_DEMO);
  const [ultimo, setUltimo] = useState(0);
  useEffect(() => {
    if (parado) return;
    const id = window.setInterval(() => {
      setVotos((v) => {
        if (v[0] + v[1] + v[2] >= UNIDADES_DEMO - 2) return INICIO_DEMO;   // recomeça
        const r = Math.random();
        const i = r < 0.68 ? 0 : r < 0.9 ? 1 : 2;
        return v.map((n, j) => (j === i ? n + 1 : n));
      });
      setUltimo((u) => u + 1);
    }, 2600);
    return () => window.clearInterval(id);
  }, [parado]);
  return { votos, apto: APTOS_DEMO[ultimo % APTOS_DEMO.length], chave: ultimo };
}

function PreviaProduto() {
  const { votos, apto, chave } = useVotosDemo();
  const opcoes = [
    { t: "Aprovo", v: votos[0], lider: true },
    { t: "Reprovo", v: votos[1] },
    { t: "Abstenção", v: votos[2] },
  ];
  const total = votos[0] + votos[1] + votos[2];
  const max = Math.max(...opcoes.map((o) => o.v));
  return (
    <>
      <div className="previa flutua" aria-hidden="true">
        <div className="previa-barra"><i /><i /><i /></div>
        <div className="previa-corpo">
          <div className="previa-lateral">
            <div className="d-flex align-items-center gap-2 mb-3 px-1" style={{ color: "var(--bs-body-color)" }}>
              <span className="marca"><span className="simbolo" style={{ color: "var(--bs-primary)" }}><svg width="18" height="18" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="currentColor" /></svg></span></span>
              <strong>{PRODUTO}</strong>
            </div>
            <div>Votações</div>
            <div className="ativo">Painel</div>
            <div>Moradores</div>
            <div>Unidades</div>
          </div>
          <div className="previa-main">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <strong style={{ fontSize: ".95rem" }}>Painel do síndico</strong>
              <span className="badge bg-primary">+ Nova votação</span>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-4"><div className="previa-num"><span>Abertas</span><strong>2</strong></div></div>
              <div className="col-4"><div className="previa-num"><span>Unidades</span><strong>48</strong></div></div>
              <div className="col-4"><div className="previa-num"><span>Participação</span><strong className="tabular">{Math.round((100 * total) / UNIDADES_DEMO)}%</strong></div></div>
            </div>
            <div className="previa-cartao">
              <div className="d-flex justify-content-between mb-1">
                <strong>Pintura da fachada</strong>
                <span className="badge bg-success-subtle text-success-emphasis">● Aberta</span>
              </div>
              <div className="text-body-secondary mb-3 tabular">{total} de {UNIDADES_DEMO} unidades votaram</div>
              {opcoes.map((o) => (
                <div key={o.t} className="d-flex align-items-center gap-2 mb-2">
                  <span style={{ width: 62 }} className="text-body-secondary">{o.t}</span>
                  <div className="flex-grow-1"><div className={`previa-barra-h ${o.lider ? "lider" : ""}`} style={{ width: `${(o.v / max) * 100}%` }} /></div>
                  <span className="tabular" style={{ width: 18 }}>{o.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="previa-flutuante" aria-hidden="true">
        <div key={chave} className="previa-flutuante-conteudo">
          <span className="previa-check"><Icone nome="check" tamanho={16} /></span>
          <span><strong className="d-block">Voto registrado</strong><span className="text-body-secondary">Apto {apto} · agora mesmo</span></span>
        </div>
      </div>
    </>
  );
}
