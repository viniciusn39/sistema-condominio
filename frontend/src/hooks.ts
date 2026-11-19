import { useCallback, useEffect, useState } from "react";
import { api, mensagemDeErro } from "./api";

/** Busca dados da API e expõe estado de carregamento, erro e uma função para recarregar. */
export function useApi<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelado = false;
    setCarregando(true);
    api
      .get<T>(url)
      .then((d) => {
        if (!cancelado) {
          setDados(d);
          setErro(null);
        }
      })
      .catch((e) => !cancelado && setErro(mensagemDeErro(e)))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [url, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, erro, carregando, recarregar };
}
