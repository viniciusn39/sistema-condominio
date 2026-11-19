import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Col, Row, Spinner } from "react-bootstrap";
import { api, mensagemDeErro } from "../../api";
import { useAuth } from "../../auth";
import { CamposCondominio, CamposMandato, condominioDoServidor } from "../../components/FormCondominio";
import { useFeedback } from "../../components/Feedback";
import { Carregando, ErroCarregar, Icone } from "../../components/ui";
import { mascaraCnpj } from "../../formato";
import { useApi } from "../../hooks";
import type { DadosCondominio, DadosMandato, Sessao } from "../../tipos";

interface Resposta {
  condominio: Record<string, unknown>;
  mandato: Record<string, string | null>;
  sindicos: { nome: string; email: string; mandato_inicio: string | null; mandato_fim: string | null }[];
}

export default function Condominio() {
  const { dados, erro, recarregar } = useApi<Resposta>("/admin/condominio");
  const { avisar } = useFeedback();
  const { aplicar } = useAuth();
  const [c, setC] = useState<DadosCondominio | null>(null);
  const [m, setM] = useState<DadosMandato | null>(null);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!dados) return;
    setC(condominioDoServidor(dados.condominio));
    const md = dados.mandato;
    setM({ sindico_tipo: (md.sindico_tipo as DadosMandato["sindico_tipo"]) ?? "morador", empresa_nome: md.empresa_nome ?? "",
           empresa_cnpj: mascaraCnpj(md.empresa_cnpj ?? ""), mandato_inicio: md.mandato_inicio ?? "", mandato_fim: md.mandato_fim ?? "" });
  }, [dados]);

  if (erro && !dados) return <ErroCarregar mensagem={erro} tentar={recarregar} />;
  if (!dados || !c || !m) return <Carregando />;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErroForm("");
    setSalvando(true);
    try {
      const r = await api.put("/admin/condominio", { condominio: c, mandato: m });
      avisar(r.mensagem ?? "Salvo.");
      // o nome pode ter mudado: atualiza a sessão (barra do topo, título da aba)
      aplicar(await api.get<Sessao>("/sessao"));
      recarregar();
    } catch (err) {
      setErroForm(mensagemDeErro(err));
      window.scrollTo(0, 0);
    } finally {
      setSalvando(false);
    }
  };

  const semMandato = !dados.mandato.mandato_fim;

  return (
    <>
      <div className="mb-4">
        <h1 className="pagina-titulo">Dados do condomínio</h1>
        <p className="text-body-secondary mb-0">Identificação, endereço e mandato do síndico. O nome aparece para os moradores e nas atas.</p>
      </div>
      {semMandato && <Alert variant="warning" className="d-flex gap-2 align-items-center"><Icone nome="alerta" /> Complete o tipo de síndico e as datas do seu mandato.</Alert>}
      {erroForm && <Alert variant="danger" className="py-2">{erroForm}</Alert>}
      <form onSubmit={salvar}>
        <Row className="g-4">
          <Col lg={8}>
            <Card><Card.Body className="p-4">
              <CamposCondominio c={c} muda={(k, v) => setC((a) => (a ? { ...a, [k]: v } : a))} buscarCnpj={false} />
            </Card.Body></Card>
          </Col>
          <Col lg={4}>
            <Card className="mb-4"><Card.Body className="p-4">
              <h2 className="h6 mb-3">Seu mandato</h2>
              <CamposMandato m={m} muda={(k, v) => setM((a) => (a ? { ...a, [k]: v } : a))} />
            </Card.Body></Card>
            <Card><Card.Body className="p-4">
              <h2 className="h6 mb-3">Síndicos no sistema</h2>
              {dados.sindicos.map((s) => (
                <div key={s.email} className="small py-2 border-top">
                  <strong>{s.nome}</strong>
                  <div className="text-body-secondary">{s.email}</div>
                  {s.mandato_fim && <div className="text-body-secondary">Mandato até {s.mandato_fim.split("-").reverse().join("/")}</div>}
                </div>
              ))}
              <p className="small text-body-secondary mt-2 mb-0">Para incluir um subsíndico, cadastre a pessoa em Moradores com o perfil de síndico.</p>
            </Card.Body></Card>
          </Col>
        </Row>
        <div className="d-flex justify-content-end mt-4">
          <Button type="submit" disabled={salvando}>{salvando ? <><Spinner size="sm" /> Salvando…</> : "Salvar alterações"}</Button>
        </div>
      </form>
    </>
  );
}
