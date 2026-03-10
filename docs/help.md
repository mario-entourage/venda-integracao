# Entourage Lab - Documentacao

Documentacao completa do sistema Entourage Lab, dividida em tres blocos:
1. Ajuda do aplicativo web (por modulo)
2. Ajuda da extensao ANVISA Auto-Fill
3. Requisitos de negocio atualizados

Documentos de apoio disponiveis no Google Drive:
https://drive.google.com/drive/u/0/folders/15we9mkorHBBQaHVzaJdF-Ri3gwRr4n7o

---

## 1. Ajuda do Aplicativo Web

```
==========================================================
ENTOURAGE LAB - AJUDA DO APLICATIVO WEB (POR MODULO)
==========================================================

----------------------------------------------------------
PEDIDOS
----------------------------------------------------------

DASHBOARD
  Pagina inicial com visao geral das operacoes.
  - Resumo de vendas: total de vendas, valor total e media
    por venda do mes atual.
  - Usuarios ativos: quantidade de usuarios ativos.
  - Acesso rapido: links para criar nova venda e acessar
    modulos principais.

VENDAS (menu: Vendas | rota: /remessas)
  Modulo central para gerenciamento de vendas.

  Lista de Vendas:
  - Cada linha mostra: Invoice (ou ID curto), Data, Cliente,
    CPF, Representante, Cidade/Estado, Status, Valor.
  - Invoice no formato ETGANS##### exibido quando presente.
  - Filtros por status e busca por nome do cliente.
  - Botao "Nova Venda" inicia o wizard de criacao.
  - Botao "Retomar" aparece para pedidos incompletos.

  Nova Venda - Wizard de 5 Etapas:

    Etapa 1 - Identificacao
    - Selecionar ou cadastrar Paciente (cliente).
    - Selecionar ou cadastrar Medico prescritor.
    - Upload da receita medica com extracao automatica por IA.
      Ao arrastar um arquivo sobre a pagina, a area de Receita
      fica verde ("Solte a receita aqui!") e a area de Produtos
      fica vermelha ("Nao solte aqui") para guiar o usuario.
    - Selecionar produtos e quantidades (dropdown expandido
      mostra nomes completos dos produtos).
    - Selecionar Representante (dropdown com usuarios marcados
      como Sales Rep). Padrao: "Venda Direta".
    - Definir frete (custo de envio incluido no link GlobalPay).
    - Escolher metodos de pagamento permitidos.
    - Escolher opcao ANVISA:
      * Regular - importacao com autorizacao padrao
      * Excepcional - importacao excepcional
      * Isento - sem necessidade de autorizacao

    Etapa 2 - Pagamento
    - Gera link de pagamento GlobalPay para o paciente.
    - Numero de invoice gerado automaticamente no formato
      ETGANS##### (ex: ETGAMB00042) quando ha representante.
    - Opcao de gerar Procuracao ZapSign (SIM/NAO, padrao NAO).
      Se SIM, a procuracao sera gerada automaticamente na
      etapa seguinte, apos receber todos os documentos.

    Etapa 3 - Documentacao
    - Upload de documentos obrigatorios via drag-and-drop
      ou clique. Tipos exigidos:
      * Documento de Identidade (RG / CNH)
      * Comprovante de Residencia
      * Receita Medica
      * Autorizacao ANVISA (quando aplicavel)
    - A IA classifica automaticamente o tipo de cada arquivo.
    - MULTIPLOS ARQUIVOS POR TIPO: aceita frente/verso,
      multiplas paginas. Ex: frente e verso do RG como dois
      arquivos separados. O segundo arquivo do mesmo tipo e
      acumulado sem erro.
    - CRUZAMENTO DE DADOS ENTRE DOCUMENTOS: apos processar
      todos os arquivos, o sistema cruza os dados extraidos
      de todos os documentos para preencher campos faltantes.
      Ex: CPF encontrado na identidade + endereco encontrado
      no comprovante = ambos considerados.
    - Resumo de dados extraidos: grade mostrando campos
      encontrados (verde) e faltantes (amarelo).
    - Atualizacao de cadastro: quando dados extraidos diferem
      do cadastro atual do paciente ou medico, o sistema
      pergunta se deseja atualizar. O usuario seleciona quais
      campos atualizar via checkboxes.
    - Procuracao ANVISA: se habilitada na etapa anterior,
      gerada automaticamente apos documentos recebidos.
      Link de assinatura pode ser copiado ou enviado via
      WhatsApp.
    - Link ANVISA: quando a Autorizacao ANVISA esta pendente,
      aparece um link "Abrir Nova Solicitacao ANVISA" que
      abre o modulo ANVISA em nova aba.
    - Progresso do lote: durante upload de multiplos arquivos,
      exibe contador (ex: "Processando 2/3...").

  Retomar Venda:
  - Vendas em andamento podem ser retomadas a partir da
    etapa de Documentacao ou Pagamento.
  - A lista de vendas exibe botao "Retomar" para pedidos
    incompletos.

ENVIO (menu: Envio | rota: /envio)
  Gerenciamento de envios e rastreamento de entregas.
  - Integracao com TriStar para criacao de remessas.
  - Gera etiquetas de envio (PDF).
  - Rastreamento de encomendas.
  - Status de envio atualizado automaticamente.
  - Metodos: TriStar, Correios (Sedex/PAC), Motoboy.

CONTROLE (menu: Controle | rota: /controle)
  Visao detalhada de cada pedido.
  - Todas as informacoes: cliente, medico, produtos,
    documentos, pagamento, envio.
  - Seletor de representante (dropdown para alterar rep).
  - Upload de documentos com seletor de tipo (Receita,
    Identidade, Comprovante, Laudo, NF, ANVISA, Geral).
  - Sincronizar pagamento com GlobalPay.
  - Marcar como pago, procuracao assinada, comprovante
    assinado manualmente.
  - Cancelar venda ou continuar wizard.

CLIENTES (menu: Clientes | rota: /clientes)
  Cadastro e gerenciamento de pacientes.

  Lista de Clientes:
  - Tabela com todos os clientes cadastrados.
  - Busca por nome ou CPF.
  - Clique para ver detalhes.

  Novo Cliente:
  - Formulario: Nome, Sobrenome, CPF, RG, Data de
    Nascimento, Celular, E-mail.
  - Endereco: CEP, Logradouro, Numero, Complemento,
    Bairro, Cidade, Estado.

  Detalhes do Cliente:
  - Visualizacao de todos os dados.
  - Edicao (apenas administradores).
  - Desativar cliente (soft delete).

REPRESENTANTES (menu: Representantes | rota: /representantes)
  Cadastro de representantes comerciais.

  Lista de Representantes:
  - Tabela: Nome, Codigo, Email, Telefone.
  - Botao "Novo Representante" (apenas administradores).

  Novo Representante:
  - Campos: Nome (obrigatorio), Codigo (obrigatorio),
    Email (opcional), Telefone (opcional).
  - Vincular a Usuario: opcao de associar o representante
    a um usuario existente do sistema (selecao por email).

  Detalhes do Representante:
  - Visualizacao: Codigo, Email, Telefone, Usuario
    Vinculado, Status.
  - Edicao e desativacao (apenas administradores).
  - Alterar vinculo com usuario existente.

  Cadastro Rapido (no Wizard de Vendas):
  - Na etapa de Pagamento, clicar "+ Novo Representante"
    para cadastrar sem sair do wizard.
  - Formulario rapido: Nome, Codigo, Email, Telefone,
    vinculo opcional com usuario.

MEDICOS (menu: Medicos | rota: /medicos)
  Cadastro de medicos prescritores.

  Lista de Medicos:
  - Tabela com todos os medicos cadastrados.
  - Busca por nome ou CRM.

  Novo Medico:
  - Campos: Nome, Sobrenome, CRM/CRO (obrigatorio),
    Especialidade, Estado, Cidade, Telefone Fixo,
    Celular, E-mail.

  Detalhes do Medico:
  - Visualizacao de todos os dados.
  - Edicao e desativacao (apenas administradores).

----------------------------------------------------------
PRODUTOS & ESTOQUE
----------------------------------------------------------

ESTOQUE (menu: Estoque | rota: /estoque)
  Gerenciamento do estoque de produtos.
  - Lista de produtos com quantidades disponiveis.
  - Controle de entrada e saida de estoque.
  - Cadastro de novos produtos (apenas administradores).
  - Campos do produto: Nome, Descricao, SKU, Codigo HS,
    Concentracao, Preco, Inventario.
  - Depositos (stocks) com codigo sequencial e nome.

----------------------------------------------------------
DOCUMENTOS
----------------------------------------------------------

DOCUMENTOS (menu: Documentos | rota: /documentos)
  Repositorio central de todos os documentos do sistema.
  - Colunas: Tipo, Pedido, Medico, Enviado por, Data.
  - Clique em um documento para ver todos os metadados.
  - Upload de documentos na pagina do pedido com seletor
    de tipo (Receita, Identidade, Comprovante de Endereco,
    Laudo Medico, Nota Fiscal, Autorizacao ANVISA, Geral).
  - Tipos suportados:
    * Prescricao (Receita Medica)
    * Identidade (RG/CNH)
    * Comprovante de Endereco
    * Laudo Medico
    * Nota Fiscal
    * Autorizacao ANVISA
    * Geral (para documentos nao classificados)
  - Formatos aceitos: PDF, JPG, JPEG, PNG.

----------------------------------------------------------
FINANCEIRO
----------------------------------------------------------

PAGAMENTOS (menu: Pagamentos | rota: /pagamentos)
  Gerenciamento de pagamentos e links de cobranca.
  - Integracao com GlobalPay para geracao de links.
  - Colunas: Invoice, Valor, Cliente, Representante, Data,
    Status.
  - Invoice no formato ETGANS##### (ex: ETGAMB00042).
  - Busca por invoice, representante, cliente ou medico.
  - Filtro por status: Pendente, Pago, Expirado, Cancelado,
    Falhou.
  - Cards de resumo: Total, Pendentes, Pagos.
  - Botao "Sincronizar GlobalPay" para atualizar status.
  - Moedas: BRL, USD.
  - Webhook automatico atualiza status ao receber
    confirmacao do GlobalPay.

----------------------------------------------------------
ANVISA
----------------------------------------------------------

SOLICITACOES (menu: Solicitacoes | rota: /anvisa)
  Painel de solicitacoes ANVISA.
  - Lista com status: Pendente, Em Ajuste, Em Automacao,
    Concluido, Erro.
  - Filtros por status e busca.
  - Clique para ver detalhes e ajustar dados.

NOVA SOLICITACAO (menu: Nova Solicitacao | rota: /anvisa/nova)
  Formulario para criar nova solicitacao ANVISA.
  - Upload de documentos obrigatorios:
    * Documento do Paciente (RG, CNH, identidade)
    * Comprovante de Residencia (luz, agua, gas, extrato)
    * Receita Medica
    * Procuracao (opcional)
  - A IA classifica automaticamente cada documento.
  - Extracao automatica de dados via OCR:
    * Paciente: nome, CPF, RG, data nascimento, endereco
    * Medico: nome, CRM, especialidade, estado, cidade
    * Receita: data, medicamento, posologia/dosagem
  - Multiplas paginas por tipo de documento: dados sao
    mesclados automaticamente (maior confianca vence).
  - Validacao de formatos (CPF, CEP, datas, telefone).
  - Apos processar todos os documentos, os dados sao
    enviados automaticamente para a extensao ANVISA
    Auto-Fill (se instalada).

DETALHES DA SOLICITACAO (rota: /anvisa/[id])
  Ajuste de dados extraidos pela IA.
  - Formulario editavel com todos os campos.
  - Destaque por confianca:
    * Vermelho: confianca < 70%
    * Amarelo: confianca < 85%
    * Sem destaque: confianca >= 85%
  - Campos faltantes: lista de campos criticos nao
    encontrados nos documentos.
  - Sugestoes de correcao da IA para dados incorretos.
  - Campos organizados em secoes:
    * Dados do Paciente
    * Dados do Prescritor
    * Dados da Receita
  - Botao "Enviar para Extensao" para reenviar dados
    ao ANVISA Auto-Fill.

MODELO SOLICITANTE (menu: Modelo Solicitante | rota: /anvisa/perfil)
  Perfil padrao do solicitante para solicitacoes ANVISA.
  - Dados pre-preenchidos do solicitante (quem faz a
    solicitacao junto a ANVISA em nome do paciente).
  - Campos: Nome, Email, RG, Endereco, CEP, Telefone,
    Telefone Fixo.
  - Editavel pelo usuario.
  - Incluido automaticamente no payload enviado para
    a extensao.

----------------------------------------------------------
ADMINISTRACAO
----------------------------------------------------------

USUARIOS (menu: Usuarios | rota: /usuarios)
  Gerenciamento de usuarios (apenas administradores).
  - Lista com email, grupo e status.
  - Alterar grupo: Admin, User ou View Only.
  - Ativar/desativar usuarios.
  - Usuarios criados automaticamente no primeiro login
    via Google OAuth com dominio @entouragelab.com.

----------------------------------------------------------
PERFIL
----------------------------------------------------------

PERFIL (menu: Perfil | rota: /perfil)
  Configuracoes pessoais do usuario logado.
  - Nome completo, sexo, data de nascimento.
  - Endereco completo (CEP, rua, numero, complemento,
    bairro, cidade, estado).
  - Dados de contato: email, telefone, CPF.
  - Numero do documento de identificacao.

----------------------------------------------------------
INFORMACOES GERAIS
----------------------------------------------------------

AUTENTICACAO
  - Login via Google OAuth (dominio @entouragelab.com).
  - Sessao mantida automaticamente.
  - Niveis: Admin (acesso total), User (operacoes padrao),
    View Only (somente leitura).

PERMISSOES
  Funcionalidade              Admin  User  View Only
  -------------------------------------------------------
  Visualizar dados            Sim    Sim   Sim
  Criar vendas                Sim    Sim   Nao
  Criar/editar clientes       Sim    Sim   Nao
  Criar/editar medicos        Sim    Sim   Nao
  Criar/editar representantes Sim    Nao   Nao
  Gerenciar usuarios          Sim    Nao   Nao
  Editar estoque              Sim    Nao   Nao
  Desativar registros         Sim    Nao   Nao

FORMATOS ACEITOS
  - Documentos: PDF, JPG, JPEG, PNG
  - CPF: 000.000.000-00 (11 digitos)
  - CEP: 00000-000 (8 digitos)
  - Telefone: (00) 00000-0000
  - Data: DD/MM/AAAA (exibicao) ou AAAA-MM-DD (formularios)
```

---

## 2. Ajuda da Extensao ANVISA Auto-Fill

```
==========================================================
EXTENSAO ANVISA AUTO-FILL - GUIA DE USO
==========================================================

VISAO GERAL
  A extensao "ANVISA Auto-Fill" e uma extensao do Google
  Chrome que preenche automaticamente o formulario de
  solicitacao de importacao no site da ANVISA, usando os
  dados extraidos pelo sistema Entourage Lab.

  A extensao e um projeto separado do aplicativo web.
  O aplicativo web se comunica com a extensao via
  window.postMessage().

----------------------------------------------------------
PRE-REQUISITOS
----------------------------------------------------------

  1. Google Chrome instalado.
  2. Extensao "ANVISA Auto-Fill" instalada no Chrome.
  3. Acesso ao sistema Entourage Lab (app web).
  4. Documentos do paciente ja processados no modulo
     ANVISA do Entourage Lab.

----------------------------------------------------------
COMO USAR
----------------------------------------------------------

  Passo 1: Preparar os dados no Entourage Lab
  - Acesse o modulo ANVISA > Nova Solicitacao.
  - Faca upload dos documentos do paciente (identidade,
    comprovante de residencia, receita medica, procuracao).
  - Aguarde o processamento OCR e a extracao de dados.
  - Revise e corrija os campos na tela de Detalhes da
    Solicitacao (ajuste campos com baixa confianca).
  - O sistema envia os dados automaticamente para a
    extensao apos processar todos os documentos.

  Passo 2: Preencher o formulario ANVISA
  - Abra o site da ANVISA em outra aba do navegador.
  - Clique no icone da extensao "ANVISA Auto-Fill" na
    barra de extensoes do Chrome.
  - Clique em "Preencher Formulario".
  - A extensao preenche automaticamente os campos do
    formulario ANVISA com os dados recebidos.

  Passo 3: Revisar e enviar
  - Confira todos os campos preenchidos no site da ANVISA.
  - Corrija manualmente qualquer campo incorreto.
  - Envie a solicitacao no site da ANVISA.
  - Anote o numero de confirmacao.

----------------------------------------------------------
REENVIAR DADOS PARA A EXTENSAO
----------------------------------------------------------

  Se a extensao nao recebeu os dados (ex: foi reinstalada
  ou a pagina foi recarregada):
  1. Volte ao Entourage Lab, tela de Detalhes da
     Solicitacao ANVISA.
  2. Clique no botao "Reenviar para extensao".
  3. Aguarde a confirmacao (mensagem verde).
  4. Volte ao site da ANVISA e use a extensao normalmente.

----------------------------------------------------------
DADOS ENVIADOS PARA A EXTENSAO
----------------------------------------------------------

  O sistema envia os seguintes campos (quando disponiveis):

  Dados do Paciente:
  - Nome completo
  - RG
  - CPF
  - Data de nascimento
  - CEP
  - Endereco completo
  - Estado / Cidade
  - Telefone
  - Email

  Dados do Medico Prescritor:
  - Nome
  - CRM/CRO
  - Especialidade
  - Estado / Cidade
  - Telefone fixo / Celular
  - Email

  Dados da Receita:
  - Data da receita
  - Nome do medicamento
  - Posologia / Dosagem

  Dados do Solicitante (do Modelo Solicitante):
  - Nome
  - Email
  - RG
  - Endereco / CEP
  - Telefone / Telefone fixo

----------------------------------------------------------
SOLUCAO DE PROBLEMAS
----------------------------------------------------------

  "Extensao nao respondeu" (apos 2 segundos):
  - Verifique se a extensao esta instalada e ativada.
  - Recarregue a pagina do Entourage Lab (F5).
  - Clique em "Reenviar para extensao".
  - Se o problema persistir, reinstale a extensao.

  Campos nao preenchidos no formulario ANVISA:
  - Verifique se os dados foram extraidos corretamente
    na tela de Detalhes da Solicitacao.
  - Campos com baixa confianca (vermelho/amarelo) podem
    estar incorretos ou ausentes.
  - Preencha campos faltantes manualmente no Entourage
    Lab e reenvie para a extensao.

  Extensao nao aparece na barra do Chrome:
  - Acesse chrome://extensions/ e verifique se esta ativa.
  - Clique no icone de quebra-cabeca (extensoes) e fixe
    a extensao "ANVISA Auto-Fill" na barra.

----------------------------------------------------------
PROTOCOLO DE COMUNICACAO (TECNICO)
----------------------------------------------------------

  O app web envia dados via:
    window.postMessage({
      type: 'anvisa-autofill-data',
      data: { ...campos extraidos e do perfil }
    }, '*');

  A extensao responde com:
    window.postMessage({
      type: 'anvisa-extension-data-stored',
      success: true/false,
      fieldCount: <numero de campos recebidos>,
      error: <mensagem de erro se success=false>
    }, '*');

  - Envio automatico: apos OCR completo + perfil carregado.
  - Envio manual: botao "Reenviar para extensao".
  - Timeout: 2 segundos para resposta da extensao.
```

---

## 3. Requisitos de Negocio Atualizados

```
==========================================================
ENTOURAGE LAB - REQUISITOS DE NEGOCIO
==========================================================
Atualizado em: 10/03/2026
Reflete o estado atual do aplicativo e banco de dados.

----------------------------------------------------------
VISAO GERAL DO SISTEMA
----------------------------------------------------------

  O Entourage Lab e um sistema de gestao de vendas de
  produtos a base de cannabis medicinal, com foco na
  importacao legal para o Brasil via autorizacao ANVISA.

  Tecnologias:
  - Frontend: Next.js 15 (App Router)
  - Banco de dados: Firebase Firestore
  - Armazenamento: Firebase Storage
  - Autenticacao: Google OAuth (Firebase Auth)
  - IA: Google Gemini 2.5 Flash (classificacao de
    documentos e extracao OCR)
  - Cloud Functions: OCR via Google Vision API

----------------------------------------------------------
COLECOES DO BANCO DE DADOS (FIRESTORE)
----------------------------------------------------------

  orders (pedidos)
    Campos: id, status, invoice, legalGuardian, currency,
      amount, discount, type, anvisaOption, anvisaStatus,
      zapsignDocId, zapsignStatus, zapsignSignUrl,
      documentsComplete, tristarShipmentId,
      prescriptionDocId, softDeleted, createdById,
      updatedById, createdAt, updatedAt
    Subcolecoes:
      customer/    - id, name, document, orderId, userId
      representative/ - id, name, code, saleId, userId
      doctor/      - id, name, crm, orderId, userId
      products/    - id, orderId, stockProductId, quantity,
                     price, discount
      shipping/    - id, tracking, price, insurance,
                     insuranceValue, orderId, address,
                     method, tristarShipmentId,
                     tristarStatus, tristarTrackingCode,
                     tristarLabelUrl, carrier,
                     trackingNumber, shipper, sendDate,
                     cost, notes, shippingStatus
      documents/   - id, orderId, documentType, status,
                     requestedAt, receivedAt, documentId
      payments/    - id, provider, status, currency, amount,
                     paymentLinkId, paymentId, paymentUrl,
                     paymentDate, orderId
      paymentLinks/ - id, status, currency, amount,
                      referenceId, paymentMethod,
                      exchangeAtPayment, feeForMerchant,
                      installmentMerchant,
                      installmentCustomer, secretKey,
                      orderId, provider, expiresAt

  clients (pacientes)
    Campos: id, document (CPF), rg, firstName, lastName,
      fullName, email, phone, birthDate, address (objeto:
      postalCode, street, streetNumber, complement,
      neighborhood, city, state), active, createdAt,
      updatedAt, removedAt

  doctors (medicos prescritores)
    Campos: id, firstName, lastName, fullName, email,
      crm, mainSpecialty, state, city, phone, mobilePhone,
      active, createdAt, updatedAt, removedAt

  representantes
    Campos: id, name, code (maiusculo), email, phone,
      userId (vinculo opcional com usuario), active,
      createdAt, updatedAt, removedAt

  products (produtos)
    Campos: id, name, description, sku, hsCode,
      concentration, price, inventory, active,
      createdAt, updatedAt, removedAt

  stocks (depositos)
    Campos: id, code (auto-incrementado), name,
      description, createdAt, updatedAt

  stockProducts (produtos por deposito)
    Campos: id, quantity, stockId, productId,
      createdAt, updatedAt

  users (usuarios do sistema)
    Campos: id (Firebase Auth UID), email, groupId
      ("admin"/"user"/"view_only"), active, lastLogin,
      createdAt, updatedAt, removedAt
    Subcolecao:
      profiles/ - id, userId, fullName, sex, birthDate,
        state, city, address, email, documentNumber,
        postalCode, phone, cpf, streetName, streetNumber,
        complemento, bairro

  documents (registro central de documentos)
    Campos: id, type, holder, key, number, metadata,
      userId, orderId, createdAt, updatedAt

  prescriptions (receitas medicas)
    Campos: id, prescriptionDate, uploadDate, clientId,
      doctorId, orderId, prescriptionPath, products
      (array: productId, quantity)

  anvisa_requests (solicitacoes ANVISA)
    Campos: id, patientDisplayName, status, createdAt,
      updatedAt, ownerEmail, pacienteDocumentId,
      pacienteDocumentIds, procuracaoDocumentId,
      procuracaoDocumentIds,
      comprovanteResidenciaDocumentId,
      comprovanteResidenciaDocumentIds,
      receitaMedicaDocumentId, receitaMedicaDocumentIds,
      currentStep, softDeleted, confirmationNumber
    Subcolecoes:
      pacienteDocuments/
      comprovanteResidenciaDocuments/
      procuracaoDocuments/
      receitaMedicaDocuments/
    Cada doc: id, fileName, fileStoragePath,
      ocrTextChunks, ocrStatus, extractedFields
      (JSON string), missingCriticalFields,
      fieldConfidence (JSON string)

  anvisa_userProfiles (perfis de solicitante)
  anvisa_defaultProfile (perfil padrao)

----------------------------------------------------------
STATUS E FLUXOS
----------------------------------------------------------

  Status do Pedido (OrderStatus):
    pending -> processing -> awaiting_documents ->
    documents_complete -> awaiting_payment -> paid ->
    shipped -> delivered
    (cancelled pode ocorrer em qualquer ponto)

  Tipo de Pedido (OrderType):
    sale, return, exchange

  Opcao ANVISA (AnvisaOption):
    regular, exceptional, exempt

  Status de Documento (DocumentRequestStatus):
    pending -> received -> approved
    (rejected se reprovado)

  Tipos de Documento (DocumentType):
    prescription, identity, medical_report,
    proof_of_address, invoice, anvisa_authorization,
    general

  Status de Pagamento:
    created -> pending -> processing -> approved
    (failed, refunded, cancelled)

  Status ANVISA (AnvisaRequestStatus):
    PENDENTE -> EM_AJUSTE -> EM_AUTOMACAO -> CONCLUIDO
    (ERRO pode ocorrer em qualquer ponto)

  Status de Envio (ShippingStatus):
    pending -> sent -> delivered (returned)

  Metodos de Envio:
    TRISTAR, LOCAL_MAIL (Correios), MOTOBOY, OTHER

----------------------------------------------------------
INTEGRACOES EXTERNAS
----------------------------------------------------------

  GLOBALPAY (Pagamentos)
    Fluxo:
    1. Autenticacao: POST /paymentapi/auth
       Body: { pubKey, merchantCode }
       Retorna: JWT token (cache com auto-refresh)
    2. Criar link: POST /paymentapi/order
       Body: { amount, currency, merchantCode, pubKey,
         invoice (orderId), callback, description,
         client: { name, email, phone, doc } }
       Retorna: { orderId, authCode, url (link pagamento) }
    3. Webhook: POST /api/webhooks/payment
       Atualiza status do pagamento e do pedido
       automaticamente quando pagamento e aprovado.
    Moedas suportadas: BRL, USD
    Status de sucesso: approved, paid, completed, success

  ZAPSIGN (Assinatura Digital de Procuracoes)
    Fluxo:
    1. Criar documento: POST /api/v1/docs/
       Envia procuracao em Markdown com dados do paciente.
       Retorna: { token (docId), signers[0].sign_url }
    2. Assinatura: paciente acessa sign_url para assinar.
    3. Webhook: POST /api/webhooks/zapsign
       Atualiza zapsignStatus no pedido.
    Conteudo da Procuracao:
    - Autoriza Caio Santos Abreu a representar o paciente
      perante a ANVISA para importacao de cannabis medicinal
      (RDC 660/2022).
    - Inclui: procedimentos de importacao, desembaraco
      aduaneiro, conformidade ANVISA/Receita Federal,
      recebimento e transporte.
    - Validade: 1 ano ou ate conclusao dos objetivos.

  TRISTAR (Logistica e Envio)
    Fluxo:
    1. Criar remessa: POST /shipments
       Body: { recipient (nome, CPF, endereco),
         items (tipo, quantidade, valor,
           anvisa_authorization para CBD/THC),
         insurance, insurance_value }
       Retorna: { id, status, tracking_code, label_url }
    2. Confirmar: POST /shipments/{id}/confirm
    3. Rastrear: GET /tracking/{id}
    4. Etiqueta: GET /shipments/{id}/label
    Tipos de item:
    - 10: Produtos, 20: Livros, 30: Medicamento
    - 40: CBD, 41: THC (exigem campos ANVISA)
    - 90: Outro (imune)

  GOOGLE AI / GEMINI (IA)
    - Classificacao automatica de documentos uploadados.
    - Extracao de dados estruturados via visao computacional.
    - Modelo: Gemini 2.5 Flash.
    - Sugestoes de correcao para campos com baixa confianca.

  GOOGLE CLOUD VISION (OCR via Cloud Functions)
    - Funcao: anvisaProcessDocumentOnUpload
    - Trigger: upload para Firebase Storage
    - Pre-processamento: auto-rotacao EXIF, escala de cinza,
      normalizacao de contraste, upscale 1.5x (max 4000px).
    - Retorna texto completo para extracao de campos.
    - Timeout: 300s, Memoria: 1GB.
    - Ate 3 tentativas em caso de erro.

  EXTENSAO ANVISA AUTO-FILL (Chrome)
    - Comunicacao via window.postMessage().
    - Mensagem de envio: type 'anvisa-autofill-data'
    - Mensagem de resposta: type 'anvisa-extension-data-stored'
    - Envio automatico apos conclusao do OCR.
    - Envio manual via botao "Reenviar para extensao".
    - Timeout de 2 segundos para resposta.

----------------------------------------------------------
AUTENTICACAO E PERMISSOES
----------------------------------------------------------

  Autenticacao:
  - Google OAuth exclusivo para @entouragelab.com.
  - Usuarios criados automaticamente no primeiro login.
  - Sessao mantida via Firebase Auth.

  Grupos de acesso (UserGroupType):
  - ADMIN: acesso total a todos os modulos.
  - USER: criar/editar vendas, clientes, medicos.
  - VIEW_ONLY: somente leitura.

  Permissoes detalhadas:
  - Visualizar dados: Admin, User, View Only
  - Criar vendas: Admin, User
  - Criar/editar clientes: Admin, User
  - Criar/editar medicos: Admin, User
  - Criar/editar representantes: Admin
  - Gerenciar usuarios: Admin
  - Editar estoque: Admin
  - Desativar registros: Admin

----------------------------------------------------------
FLUXO COMPLETO DE UMA VENDA
----------------------------------------------------------

  1. Usuario cria Nova Venda (Wizard Etapa 1):
     - Seleciona/cadastra paciente e medico.
     - Adiciona produtos e quantidades.
     - Escolhe opcao ANVISA (regular/excepcional/isento).
     - Cria pedido no Firestore com status "pending".

  2. Pagamento (Wizard Etapa 2):
     - Gera link GlobalPay com valor total.
     - Escolhe se gera procuracao ZapSign.
     - Associa representante (ou "Venda Direta").
     - Pedido atualizado: status "awaiting_payment".

  3. Documentacao (Wizard Etapa 3):
     - Upload de documentos obrigatorios.
     - IA classifica tipo e extrai dados.
     - Multiplos arquivos por tipo aceitos.
     - Cruzamento de dados entre todos os documentos.
     - Atualizacao de cadastro quando aplicavel.
     - Procuracao ZapSign gerada automaticamente (se SIM).
     - Link para Nova Solicitacao ANVISA (se pendente).
     - Pedido atualizado: status "awaiting_documents"
       ou "documents_complete".

  4. Pagamento confirmado (via webhook GlobalPay):
     - Pedido atualizado: status "paid".

  5. Envio (modulo Envio):
     - Criacao de remessa TriStar ou manual.
     - Etiqueta gerada e impressa.
     - Pedido atualizado: status "shipped".

  6. Entrega:
     - Rastreamento atualizado.
     - Pedido atualizado: status "delivered".

----------------------------------------------------------
ARMAZENAMENTO (FIREBASE STORAGE)
----------------------------------------------------------

  Estrutura de pastas:
  - documents/prescriptions/{timestamp}_{filename}
  - anvisa_requests/{requestId}/{docType}/{docId}/
    {filename}

----------------------------------------------------------
FORMATOS E VALIDACOES
----------------------------------------------------------

  - CPF: 000.000.000-00 (11 digitos, validacao de formato)
  - CEP: 00000-000 (8 digitos)
  - Telefone: (00) 00000-0000
  - Data exibicao: DD/MM/AAAA
  - Data formulario: AAAA-MM-DD
  - Documentos: PDF, JPG, JPEG, PNG
  - CRM/CRO: formato livre (validacao de preenchimento)
  - Email: formato padrao com @
  - Moeda: BRL ou USD
  - Codigo representante: texto em maiusculas
```
