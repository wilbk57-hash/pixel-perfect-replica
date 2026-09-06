# Rotina de Teste Manual — PWA BK BUSINESS

Objetivo: validar que a app instala, abre, funciona offline e que **nenhuma atualização publicada causa ecrã branco nem carrega ficheiros antigos**.

Use sempre a **URL publicada** (não o preview do editor). O service worker só regista em produção; no preview ele é propositadamente removido.

**Duração estimada:** 15–20 minutos · **Frequência sugerida:** após cada publicação importante.

---

## Parte 1 — Instalação (Android / Chrome)

1. Abra a URL publicada no Chrome do telemóvel.
2. Menu (⋮) → **"Adicionar ao ecrã principal"** / **"Instalar app"**.
3. Confirme que aparece o ícone da BK BUSINESS no ecrã principal.

✅ **Passa se:** o ícone aparece com o nome "BK BUSINESS" e a app abre em janela própria (sem barra de endereço do navegador).

### iPhone / Safari

1. Abra a URL no Safari.
2. Botão Partilhar → **"Adicionar ao ecrã principal"**.

✅ **Passa se:** abre em ecrã cheio com o ícone correto.

---

## Parte 2 — Abertura e sessão

1. Abra a app instalada.
2. Inicie sessão com uma conta de teste.
3. Navegue por: Painel → PDV → Vendas → Estoque → Dívidas.

✅ **Passa se:** todas as páginas carregam, sem ecrã branco, e os dados da empresa aparecem.

---

## Parte 3 — Funcionamento offline

1. Com a app aberta e sessão iniciada, ative o **modo avião**.
2. Feche a app completamente e volte a abrir a partir do ícone.
3. Navegue pelas páginas visitadas antes (Painel, PDV).

✅ **Passa se:** a app abre (mesmo sem internet) e mostra os últimos dados conhecidos. O indicador de sincronização deve mostrar estado offline/pendente.
❌ **Falha se:** ecrã branco ou "sem ligação" do navegador em vez da app.

4. Ainda offline, faça uma **venda de teste no PDV**.
5. Desative o modo avião e aguarde ~10 segundos.

✅ **Passa se:** a venda aparece em **Vendas** exatamente **uma vez** (sem duplicar), e o stock do produto desceu uma única vez.

---

## Parte 4 — Atualização remota (o teste mais importante)

Simula o que acontece quando publica uma nova versão enquanto os clientes têm a app aberta/instalada.

1. Com a app instalada e a funcionar (versão A), **publique uma alteração qualquer** no Lovable (ex.: mude um texto visível do Painel).
2. No telemóvel, com a versão A ainda aberta, navegue para uma página que ainda não tinha aberto nesta sessão (ex.: Dívidas).

✅ **Passa se:** acontece **uma** destas duas coisas, ambas corretas:
   - a página abre normalmente, **ou**
   - aparece o ecrã **"A atualizar a aplicação…"** e a página recarrega sozinha para a nova versão.

❌ **Falha crítica se:** ecrã branco, erro de carregamento permanente, ou a app continua a mostrar a versão antiga depois de recarregar.

3. Feche e reabra a app pelo ícone. Confirme que a alteração publicada está visível.

✅ **Passa se:** a nova versão está ativa em **1–2 aberturas** (o service worker atualiza em segundo plano; na primeira abertura pode ainda servir a versão anterior e atualizar para a seguinte).

4. Verificação extra (opcional, no Chrome do computador): abra a URL publicada → DevTools → **Application → Service Workers** → confirme que existe `/sw.js` ativo; em **Cache Storage** confirme que só existe a cache `bk-business-shell-v4` (versões antigas são apagadas automaticamente).

---

## Parte 5 — Recuperação automática (blank screen)

A app tem um mecanismo de autorrecuperação: se um ficheiro antigo deixar de existir após uma publicação, ela limpa caches, remove o service worker e recarrega **uma única vez**.

Teste manual:
1. Publique uma nova versão.
2. Num dispositivo com a versão antiga aberta, force a navegação entre páginas.
3. Observe: se surgir o erro de ficheiro antigo, a página deve mostrar **"A atualizar a aplicação…"** e recarregar sozinha em segundos.

✅ **Passa se:** a app recupera sozinha sem intervenção do utilizador.
❌ **Falha se:** fica presa em ciclo de recarregamentos (mais de 2 reloads seguidos) — nesse caso reportar imediatamente.

---

## Folha de registo (copiar a cada teste)

| # | Teste | Resultado | Observações |
|---|-------|-----------|-------------|
| 1 | Instalação Android | ☐ OK ☐ Falha | |
| 1b | Instalação iPhone | ☐ OK ☐ Falha | |
| 2 | Abertura e sessão | ☐ OK ☐ Falha | |
| 3 | Abre offline (modo avião) | ☐ OK ☐ Falha | |
| 3b | Venda offline sincroniza 1x | ☐ OK ☐ Falha | |
| 4 | Atualização sem ecrã branco | ☐ OK ☐ Falha | |
| 4b | Nova versão ativa em 1–2 aberturas | ☐ OK ☐ Falha | |
| 5 | Recuperação automática | ☐ OK ☐ Falha | |

**Data:** ____  **Versão testada:** ____  **Testado por:** ____

---

## Notas técnicas (referência)

- O service worker (`/sw.js`, cache `bk-business-shell-v4`) só regista em produção; no preview do editor é removido automaticamente.
- Navegação de páginas usa "rede primeiro, cache como reserva"; bundles `/assets/*` também são rede-primeiro para nunca servir ficheiros de versões antigas.
- Chamadas à base de dados e à IA nunca passam pela cache.
- A autorrecuperação limpa caches + service workers e recarrega no máximo 1 vez por sessão (evita ciclos infinitos).
