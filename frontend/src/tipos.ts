export type Perfil = "admin" | "votante";
export type Estado = "agendada" | "aberta" | "encerrada";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
}

export interface CondominioResumo {
  id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  papel?: "sindico" | "morador";
}

export interface Sessao {
  usuario: Usuario | null;
  csrf: string;
  condominio: string;
  condominio_atual: CondominioResumo | null;
  condominios: CondominioResumo[];
}

export type TipoCondominio = "residencial" | "comercial" | "misto";
export type TipoSindico = "morador" | "profissional" | "empresa";

export interface DadosCondominio {
  nome: string;
  cnpj: string;
  tipo: TipoCondominio;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  n_blocos: string;
  n_unidades: string;
  telefone: string;
  email: string;
  administradora: string;
}

export interface DadosMandato {
  sindico_tipo: TipoSindico;
  empresa_nome: string;
  empresa_cnpj: string;
  mandato_inicio: string;
  mandato_fim: string;
}

export interface Votacao {
  id: number;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  encerrada_em: string | null;
  estado: Estado;
  /** segundos até abrir (agendada) ou encerrar (aberta) */
  segundos: number | null;
  total_votos?: number;
  meus_votos?: number;
  quorum_minimo: number;
  maioria: Maioria;
  fundamento: string | null;
}

export type Maioria = "simples" | "absoluta" | "dois_tercos";

export interface Apuracao {
  quorum_minimo: number;
  unidades_quorum: number;
  quorum_atingido: boolean;
  participacao: number;
  maioria: Maioria;
  maioria_rotulo: string;
  votos_necessarios: number | null;
  vencedora: string | null;
  situacao: "em_andamento" | "sem_votos" | "sem_quorum" | "empate" | "sem_maioria" | "decidida";
  texto: string;
}

export interface ListaVotacoes {
  votacoes: Votacao[];
  n_unidades: number;
  total_unidades: number;
  painel: {
    encerradas: number;
    participei: number;
    participacao_media: number | null;
    decididas: number;
    ultima: { id: number; titulo: string; data_fim: string; resultado: Resultado } | null;
  };
}

export interface Opcao {
  id: number;
  texto: string;
}

export interface MinhaUnidade {
  id: number;
  bloco: string;
  numero: string;
  opcao_votada: number | null;
}

export interface Resultado {
  itens: { texto: string; total: number; pct: number; lider: boolean }[];
  total: number;
  lideres: string[];
  apuracao: Apuracao;
}

export interface DetalheVotacao {
  votacao: Votacao;
  opcoes: Opcao[];
  minhas: MinhaUnidade[];
  resultado: Resultado | null;
  total_votos: number;
  total_unidades: number;
  nominal?: { unidade_id: number; bloco: string; numero: string; vaga: number; nome: string; opcao_id: number; opcao: string; data_hora: string }[];
  pendentes?: { unidade_id: number; bloco: string; numero: string; vaga: number; votante: string | null }[];
  pode_editar?: boolean;
}

export interface ResumoAdmin {
  votacoes: Votacao[];
  stats: { abertas: number; unidades: number; moradores: number; sem_votante: number };
}

export interface Morador {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: Perfil;
  ativo: boolean;
  proprias: string | null;
  vota_por: string | null;
}

export interface Pessoa {
  id: number;
  nome: string;
}

export interface Unidade {
  id: number;
  bloco: string;
  numero: string;
  proprietarios: Pessoa[];
  votante: { nome: string; tipo: "proprietario" | "representante"; indicado_por: string | null } | null;
}

export interface Aviso {
  id: number;
  titulo: string;
  texto: string;
  categoria: string;
  criado_em: string;
  editado_em: string | null;
  autor: string;
  fixado: boolean;
  lido: boolean;
  leituras?: number;
  total_moradores?: number;
  quem_viu?: string[];
}

export interface ListaAvisos {
  avisos: Aviso[];
  nao_lidos: number;
  categorias: Record<string, string>;
}

export interface LinhaImportacao {
  linha: number;
  unidade: string;
  nome: string;
  email: string;
  acoes: string[];
  erro: string | null;
}

export interface ResultadoImportacao {
  linhas?: LinhaImportacao[];
  resumo: { linhas: number; erros: number; unidades_novas: number; moradores_novos: number };
  credenciais?: { nome: string; email: string; cpf: string; senha: string }[];
  mensagem?: string;
}

export interface Documento {
  id: number;
  titulo: string;
  categoria: string;
  descricao: string | null;
  nome_original: string;
  tamanho: number;
  enviado_em: string;
  enviado_por: string;
}

export interface ListaDocumentos {
  documentos: Documento[];
  categorias: Record<string, string>;
  atas_sistema?: { id: number; titulo: string; data_fim: string }[];
}

export type SituacaoUnidade = "ativa" | "nunca_acessou" | "sem_votante" | "sem_cadastro" | "vaga";

export interface PessoaMapa { nome: string; email: string; ultimo_acesso: string | null }

export interface UnidadeMapa {
  id: number;
  bloco: string;
  numero: string;
  vaga: boolean;
  situacao: SituacaoUnidade;
  proprietarios: PessoaMapa[];
  votante: (PessoaMapa & { tipo: "proprietario" | "representante" }) | null;
  votou_ultima: boolean;
}

export interface Mapa {
  unidades: UnidadeMapa[];
  ultima_votacao: { id: number; titulo: string } | null;
}
