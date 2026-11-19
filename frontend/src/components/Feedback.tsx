import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Modal, Toast, ToastContainer } from "react-bootstrap";

type TipoAviso = "ok" | "erro" | "info";
interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}
interface PedidoConfirmacao {
  titulo: string;
  texto?: string;
  confirmar?: string;
  perigo?: boolean;
}

interface Feedback {
  avisar: (texto: string, tipo?: TipoAviso) => void;
  confirmar: (pedido: PedidoConfirmacao) => Promise<boolean>;
}

const FeedbackContext = createContext<Feedback | null>(null);
const ESTILO: Record<TipoAviso, { cor: string; icone: string; titulo: string }> = {
  ok: { cor: "success", icone: "✓", titulo: "Pronto" },
  erro: { cor: "danger", icone: "!", titulo: "Não foi possível concluir" },
  info: { cor: "info", icone: "i", titulo: "Aviso" },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { resolver: (v: boolean) => void }) | null>(null);
  const proximoId = useRef(1);

  const avisar = useCallback((texto: string, tipo: TipoAviso = "ok") => {
    setAvisos((a) => [...a, { id: proximoId.current++, texto, tipo }]);
  }, []);
  const remover = (id: number) => setAvisos((a) => a.filter((x) => x.id !== id));

  const confirmar = useCallback(
    (p: PedidoConfirmacao) => new Promise<boolean>((resolver) => setPedido({ ...p, resolver })),
    [],
  );
  const responder = (v: boolean) => {
    pedido?.resolver(v);
    setPedido(null);
  };

  return (
    <FeedbackContext.Provider value={{ avisar, confirmar }}>
      {children}

      <ToastContainer position="bottom-end" className="p-3 position-fixed">
        {avisos.map((a) => {
          const e = ESTILO[a.tipo];
          return (
            <Toast key={a.id} onClose={() => remover(a.id)} autohide delay={a.tipo === "erro" ? 7000 : 4500}
                   className={`border-${e.cor}-subtle`}>
              <Toast.Header closeLabel="Fechar">
                <span className={`badge rounded-circle text-bg-${e.cor} me-2`} aria-hidden="true">{e.icone}</span>
                <strong className="me-auto">{e.titulo}</strong>
              </Toast.Header>
              <Toast.Body>{a.texto}</Toast.Body>
            </Toast>
          );
        })}
      </ToastContainer>

      <Modal show={!!pedido} onHide={() => responder(false)} centered>
        <Modal.Header closeButton closeLabel="Cancelar">
          <Modal.Title as="h2" className="h5 mb-0">{pedido?.titulo}</Modal.Title>
        </Modal.Header>
        {pedido?.texto && <Modal.Body className="text-body-secondary">{pedido.texto}</Modal.Body>}
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => responder(false)}>Cancelar</Button>
          <Button variant={pedido?.perigo ? "danger" : "primary"} onClick={() => responder(true)} autoFocus>
            {pedido?.confirmar ?? "Confirmar"}
          </Button>
        </Modal.Footer>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback fora do FeedbackProvider");
  return ctx;
}
