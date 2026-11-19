import { useState } from "react";
import { Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";
import { cnpjValido, mascaraCep, mascaraCnpj, mascaraTelefone, soDigitos } from "../formato";
import type { DadosCondominio, DadosMandato, TipoSindico } from "../tipos";

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
  "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export const condominioVazio = (): DadosCondominio => ({
  nome: "", cnpj: "", tipo: "residencial", cep: "", logradouro: "", numero: "", complemento: "", bairro: "",
  cidade: "", uf: "", n_blocos: "", n_unidades: "", telefone: "", email: "", administradora: "",
});

export function mandatoVazio(): DadosMandato {
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fim = new Date(hoje);
  fim.setFullYear(fim.getFullYear() + 2);
  fim.setDate(fim.getDate() - 1);
  return { sindico_tipo: "morador", empresa_nome: "", empresa_cnpj: "", mandato_inicio: iso(hoje), mandato_fim: iso(fim) };
}

/** Converte o que veio da API (números, null) para o formulário (strings com máscara). */
export function condominioDoServidor(c: Record<string, unknown>): DadosCondominio {
  const v = condominioVazio();
  const texto = (k: keyof DadosCondominio) => (c[k] == null ? "" : String(c[k]));
  return {
    ...v, ...Object.fromEntries(Object.keys(v).map((k) => [k, texto(k as keyof DadosCondominio)])),
    tipo: (c.tipo as DadosCondominio["tipo"]) || "residencial",
    cnpj: mascaraCnpj(texto("cnpj")), cep: mascaraCep(texto("cep")), telefone: mascaraTelefone(texto("telefone")),
  };
}

type Muda<T> = <K extends keyof T>(campo: K, valor: T[K]) => void;

const opcional = <span className="fw-normal text-body-secondary">(opcional)</span>;

/** Dados do condomínio: identificação, endereço (com busca pelo CEP) e contato da administração. */
export function CamposCondominio({ c, muda, buscarCnpj = true }: { c: DadosCondominio; muda: Muda<DadosCondominio>; buscarCnpj?: boolean }) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [avisoCep, setAvisoCep] = useState("");
  const [avisoCnpj, setAvisoCnpj] = useState("");

  const consultarCep = async (cep: string) => {
    if (soDigitos(cep).length !== 8) return;
    setBuscandoCep(true);
    setAvisoCep("");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${soDigitos(cep)}/json/`);
      const d = await r.json();
      if (d.erro) return setAvisoCep("CEP não encontrado. Preencha o endereço manualmente.");
      if (d.logradouro) muda("logradouro", d.logradouro);
      if (d.bairro) muda("bairro", d.bairro);
      if (d.localidade) muda("cidade", d.localidade);
      if (d.uf) muda("uf", d.uf);
    } catch {
      setAvisoCep("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");
    } finally {
      setBuscandoCep(false);
    }
  };

  const consultarCnpj = async (cnpj: string) => {
    if (!buscarCnpj || !cnpjValido(cnpj)) return;
    setBuscandoCnpj(true);
    setAvisoCnpj("");
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${soDigitos(cnpj)}`);
      if (!r.ok) return setAvisoCnpj("CNPJ não encontrado na Receita. Confira o número ou preencha os dados manualmente.");
      const d = await r.json();
      if (d.razao_social && !c.nome) muda("nome", tituloProprio(d.razao_social));
      if (d.cep) muda("cep", mascaraCep(String(d.cep)));
      if (d.logradouro) muda("logradouro", tituloProprio(`${d.descricao_tipo_de_logradouro ?? ""} ${d.logradouro}`.trim()));
      if (d.numero) muda("numero", String(d.numero));
      if (d.complemento) muda("complemento", tituloProprio(d.complemento));
      if (d.bairro) muda("bairro", tituloProprio(d.bairro));
      if (d.municipio) muda("cidade", tituloProprio(d.municipio));
      if (d.uf) muda("uf", d.uf);
      setAvisoCnpj("Dados preenchidos a partir da Receita Federal. Confira antes de continuar.");
    } catch {
      setAvisoCnpj("Não foi possível consultar o CNPJ agora. Preencha os dados manualmente.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const cnpjInvalido = soDigitos(c.cnpj).length === 14 && !cnpjValido(c.cnpj);

  return (
    <Row className="g-3">
      <Col md={6}>
        <Form.Group controlId="c-cnpj">
          <Form.Label>CNPJ do condomínio {opcional}</Form.Label>
          <InputGroup>
            <Form.Control inputMode="numeric" placeholder="00.000.000/0000-00" value={c.cnpj} isInvalid={cnpjInvalido}
                          onChange={(e) => { const v = mascaraCnpj(e.target.value); muda("cnpj", v); if (soDigitos(v).length === 14) consultarCnpj(v); }} />
            {buscandoCnpj && <InputGroup.Text><Spinner size="sm" /></InputGroup.Text>}
            <Form.Control.Feedback type="invalid">CNPJ inválido. Confira os números.</Form.Control.Feedback>
          </InputGroup>
          <Form.Text>{avisoCnpj || "Está no boleto do condomínio. Se ainda não tiver, deixe em branco."}</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group controlId="c-tipo">
          <Form.Label>Tipo</Form.Label>
          <Form.Select value={c.tipo} onChange={(e) => muda("tipo", e.target.value as DadosCondominio["tipo"])}>
            <option value="residencial">Residencial</option>
            <option value="comercial">Comercial</option>
            <option value="misto">Misto (residencial e comercial)</option>
          </Form.Select>
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Form.Group controlId="c-nome">
          <Form.Label>Nome do condomínio</Form.Label>
          <Form.Control required maxLength={150} placeholder="Ex.: Condomínio Edifício Aurora" value={c.nome}
                        onChange={(e) => muda("nome", e.target.value)} />
          <Form.Text>Como aparece na convenção. É o nome que os moradores verão no sistema e nas atas.</Form.Text>
        </Form.Group>
      </Col>

      <Col xs={12}><div className="form-secao">Endereço</div></Col>
      <Col sm={5} md={4}>
        <Form.Group controlId="c-cep">
          <Form.Label>CEP</Form.Label>
          <InputGroup>
            <Form.Control required inputMode="numeric" placeholder="00000-000" value={c.cep}
                          onChange={(e) => { const v = mascaraCep(e.target.value); muda("cep", v); if (soDigitos(v).length === 8) consultarCep(v); }} />
            {buscandoCep && <InputGroup.Text><Spinner size="sm" /></InputGroup.Text>}
          </InputGroup>
          {avisoCep && <Form.Text className="text-warning-emphasis">{avisoCep}</Form.Text>}
        </Form.Group>
      </Col>
      <Col sm={7} md={8}>
        <Form.Group controlId="c-logradouro">
          <Form.Label>Logradouro</Form.Label>
          <Form.Control required maxLength={150} placeholder="Rua, avenida…" value={c.logradouro}
                        onChange={(e) => muda("logradouro", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={4} md={3}>
        <Form.Group controlId="c-numero">
          <Form.Label>Número</Form.Label>
          <Form.Control required maxLength={20} value={c.numero} onChange={(e) => muda("numero", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={8} md={4}>
        <Form.Group controlId="c-complemento">
          <Form.Label>Complemento {opcional}</Form.Label>
          <Form.Control maxLength={80} value={c.complemento} onChange={(e) => muda("complemento", e.target.value)} />
        </Form.Group>
      </Col>
      <Col md={5}>
        <Form.Group controlId="c-bairro">
          <Form.Label>Bairro</Form.Label>
          <Form.Control required maxLength={80} value={c.bairro} onChange={(e) => muda("bairro", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={8} md={9}>
        <Form.Group controlId="c-cidade">
          <Form.Label>Cidade</Form.Label>
          <Form.Control required maxLength={80} value={c.cidade} onChange={(e) => muda("cidade", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={4} md={3}>
        <Form.Group controlId="c-uf">
          <Form.Label>UF</Form.Label>
          <Form.Select required value={c.uf} onChange={(e) => muda("uf", e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </Form.Select>
        </Form.Group>
      </Col>

      <Col xs={12}><div className="form-secao">Estrutura e administração</div></Col>
      <Col xs={6} md={3}>
        <Form.Group controlId="c-blocos">
          <Form.Label>Blocos/torres</Form.Label>
          <Form.Control type="number" min={1} max={200} placeholder="Ex.: 2" value={c.n_blocos}
                        onChange={(e) => muda("n_blocos", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={6} md={3}>
        <Form.Group controlId="c-unidades">
          <Form.Label>Unidades</Form.Label>
          <Form.Control type="number" min={1} max={20000} placeholder="Ex.: 48" value={c.n_unidades}
                        onChange={(e) => muda("n_unidades", e.target.value)} />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group controlId="c-administradora">
          <Form.Label>Administradora {opcional}</Form.Label>
          <Form.Control maxLength={120} placeholder="Empresa que cuida da parte financeira" value={c.administradora}
                        onChange={(e) => muda("administradora", e.target.value)} />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group controlId="c-telefone">
          <Form.Label>Telefone da portaria/administração {opcional}</Form.Label>
          <Form.Control inputMode="tel" placeholder="(11) 3333-4444" value={c.telefone}
                        onChange={(e) => muda("telefone", mascaraTelefone(e.target.value))} />
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group controlId="c-email">
          <Form.Label>E-mail da administração {opcional}</Form.Label>
          <Form.Control type="email" maxLength={254} placeholder="administracao@condominio.com" value={c.email}
                        onChange={(e) => muda("email", e.target.value)} />
        </Form.Group>
      </Col>
    </Row>
  );
}

const TIPOS_SINDICO: { id: TipoSindico; titulo: string; texto: string }[] = [
  { id: "morador", titulo: "Síndico morador", texto: "Proprietário ou morador eleito em assembleia" },
  { id: "profissional", titulo: "Síndico profissional", texto: "Pessoa física contratada pelo condomínio" },
  { id: "empresa", titulo: "Empresa de sindicatura", texto: "Pessoa jurídica contratada" },
];

/** Tipo de síndico e período do mandato (art. 1.347 do Código Civil: até 2 anos, podendo se renovar). */
export function CamposMandato({ m, muda }: { m: DadosMandato; muda: Muda<DadosMandato> }) {
  const cnpjInvalido = soDigitos(m.empresa_cnpj).length === 14 && !cnpjValido(m.empresa_cnpj);
  return (
    <Row className="g-3">
      <Col xs={12}>
        <Form.Label>Você é</Form.Label>
        <div className="escolha-grade">
          {TIPOS_SINDICO.map((t) => (
            <label key={t.id} className={`escolha ${m.sindico_tipo === t.id ? "ativa" : ""}`}>
              <input type="radio" name="sindico_tipo" className="visually-hidden" checked={m.sindico_tipo === t.id}
                     onChange={() => muda("sindico_tipo", t.id)} />
              <strong className="d-block">{t.titulo}</strong>
              <span className="small text-body-secondary">{t.texto}</span>
            </label>
          ))}
        </div>
      </Col>
      {m.sindico_tipo === "empresa" && (
        <>
          <Col md={7}>
            <Form.Group controlId="m-empresa">
              <Form.Label>Razão social da empresa</Form.Label>
              <Form.Control required maxLength={150} value={m.empresa_nome} onChange={(e) => muda("empresa_nome", e.target.value)} />
            </Form.Group>
          </Col>
          <Col md={5}>
            <Form.Group controlId="m-empresa-cnpj">
              <Form.Label>CNPJ da empresa</Form.Label>
              <Form.Control required inputMode="numeric" placeholder="00.000.000/0000-00" value={m.empresa_cnpj}
                            isInvalid={cnpjInvalido} onChange={(e) => muda("empresa_cnpj", mascaraCnpj(e.target.value))} />
              <Form.Control.Feedback type="invalid">CNPJ inválido.</Form.Control.Feedback>
            </Form.Group>
          </Col>
        </>
      )}
      <Col xs={6}>
        <Form.Group controlId="m-inicio">
          <Form.Label>Início do mandato</Form.Label>
          <Form.Control type="date" required value={m.mandato_inicio} onChange={(e) => muda("mandato_inicio", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={6}>
        <Form.Group controlId="m-fim">
          <Form.Label>Fim do mandato</Form.Label>
          <Form.Control type="date" required value={m.mandato_fim} onChange={(e) => muda("mandato_fim", e.target.value)} />
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Form.Text>Conforme a ata da assembleia que elegeu você. O mandato é de no máximo 2 anos (art. 1.347 do Código Civil).</Form.Text>
      </Col>
    </Row>
  );
}

/** "RUA DAS FLORES" → "Rua das Flores" (a Receita devolve tudo em maiúsculas). */
function tituloProprio(t: string) {
  const minusculas = new Set(["da", "das", "de", "do", "dos", "e"]);
  return t.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}
