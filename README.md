# WhatsApp Assist — Sistema WebApp de Primeiro Atendimento via WhatsApp Web

Sistema completo para gerenciamento e automação determinística de **primeiro contato** de clientes através de uma sessão autenticada do WhatsApp Web, com transição automática para atendimento humano (Tasks).

---

## 🔒 Princípio Fundamental & Privacidade por Design

> **PROCESSAR ➔ DECIDIR ➔ DESCARTAR**

- **Sem persistência de mensagens:** Nenhuma mensagem enviada ou recebida, mídia, anexo, transcrição ou áudio é gravado em banco de dados ou logs.
- **Sem IA ou LLMs:** Funcionamento 100% determinístico baseado em máquina de estados e configuração de regras configuráveis (opções numéricas, palavras-chave, correspondência exata).
- **Sem persistência de sessão ou QR Code em banco:** SQLite armazena **apenas** configurações operacionais, regras de fluxos e metadados de tasks.
- **Princípio "Não Responder é Melhor":** Cada etapa permite configurar se o robô deve responder ou apenas aguardar o cliente, gerando task para o atendente humano sem mensagens automáticas desnecessárias.

---

## 🏗️ Arquitetura do Sistema

```
WhatsApp Assist
├── /src
│   ├── /backend
│   │   ├── server.js               # Servidor Express + WebSocket Server
│   │   └── /api                    # Rotas REST (/whatsapp, /automations, /tasks, /settings, /stats)
│   ├── /whatsapp
│   │   ├── WhatsAppAdapter.js      # Interface desacoplada (connect, disconnect, sendMessage, ...)
│   │   ├── WhatsAppWebAdapter.js   # Integração WhatsApp Web (whatsapp-web.js + isolamento temporário)
│   │   ├── MockWhatsAppAdapter.js  # Adaptador Sandbox/Simulador para testes offline
│   │   └── WhatsAppManager.js      # Gerenciador de conexão e alternância de adaptadores
│   ├── /automation
│   │   ├── StateMachine.js         # Estados conceituais e sessões efêmeras em memória
│   │   ├── RuleEngine.js           # Avaliação determinística de opções
│   │   ├── InputNormalizer.js      # Normalização de texto em memória (sem persistência)
│   │   ├── ActionExecutor.js       # Envio de mensagens e criação de tasks
│   │   ├── BusinessHoursChecker.js # Avaliação de horários de expediente e timezone
│   │   └── AutomationEngine.js     # Pipeline central de eventos e automação
│   ├── /tasks
│   │   └── TaskManager.js          # Gestão de atendimentos humanos, prioridades e links diretos
│   ├── /notifications
│   │   └── NotificationManager.js  # Notificações em tempo real via WebSocket + síntese de áudio
│   ├── /database
│   │   └── database.js             # SQLite nativo (node:sqlite) + migrações + seed automático
│   ├── /config
│   │   └── config.js               # Parâmetros e limites de segurança
│   ├── /utils
│   │   ├── EventBus.js             # Barramento de eventos interno
│   │   ├── SanitizedLogger.js      # Logs técnicos estritos com censura de dados sensíveis
│   │   ├── IdempotencyGuard.js     # Deduplicação em memória com TTL
│   │   └── LoopDetector.js         # Prevenção contra loops infinitos e oscilações A <-> B
│   └── /frontend                   # Interface SaaS Moderna (HTML5, CSS3, JS Vanilla)
│       ├── index.html
│       ├── css/styles.css
│       └── js/ (api.js, ws.js, app.js)
└── /test                           # Suíte de testes automatizados (node --test)
```

---

## 🚀 Como Executar

### 1. Requisitos
- Node.js v20+ (recomendado v22 ou v24)
- Google Chrome ou Microsoft Edge instalado no sistema operacional (para o WhatsApp Web real)

### 2. Instalação
```bash
npm install
```

### 3. Iniciar o Servidor
```bash
npm start
```
O sistema estará disponível em: **`http://localhost:3000`**

### 4. Executar Testes Automatizados
```bash
npm test
```

---

## 📱 Áreas da Aplicação

### 1. Dashboard
- Indicadores em tempo real: Status do WhatsApp, Automações Ativas, Tasks Pendentes, Atendimentos em Andamento, Aguardando Humano e Alertas Técnicos.
- Tabela de atendimentos ativos em memória (com botão para o operador assumir imediatamente).
- Linha do tempo de eventos técnicos sanitizados.

### 2. WhatsApp
- Exibição dinâmica do QR Code para autenticação via celular.
- Status da sessão: *Desconectado*, *Aguardando QR Code*, *Aguardando autenticação*, *Conectando*, *Conectado*, *Sessão perdida*.
- Botões de conexão e desconexão.
- Alternância entre **WhatsApp Web Real** e **Modo Simulador / Sandbox** (permite testar fluxos sem gastar mensagens ou depender de aparelho físico).
- Painel interativo de envio simulado.

### 3. Automações
- Lista de fluxos com botão para ativar/desativar e definir o fluxo padrão de recepção.
- **Editor de Etapas e Regras:**
  - Adição/edição de etapas com mensagens automáticas.
  - Princípio "Não Responder é Melhor" (toggle para silenciar envio de mensagens automáticas).
  - Regras de transição determinísticas: `NUMERIC_OPTION` (1, 2, 3), `KEYWORD` (palavras-chave), `EXACT_MATCH`, `ANY_TEXT`, `EMPTY`.
  - Tratamento de resposta inválida com limite de tentativas configurável e transferência para humano ao esgotar.
  - Duplicação e exclusão de fluxos.

### 4. Tasks (Atendimento Humano)
- Central de atendimentos que requerem intervenção de um operador.
- Filtros por Status (*Pendentes*, *Em Atendimento*, *Concluídas*) e Prioridade (*Urgente*, *Alta*, *Média*, *Baixa*).
- **Ações Rápidas:**
  - **⚡ Assumir:** Pausa a automação para aquele contato (estado `HANDOFF`), marca a task como Em Atendimento e abre o chat no WhatsApp Web.
  - **↗️ WhatsApp Web:** Link direto formatado (`https://web.whatsapp.com/send?phone=...`).
  - **✓ Concluir:** Finaliza a task.

### 5. Configurações
- Nome da empresa e atendente padrão.
- Fuso horário.
- Ativação/Desativação global da automação.
- Alertas sonoros (sintetizados no navegador via Web Audio API).
- Tabela de Horário de Funcionamento (Segunda a Domingo com horários de abertura e fechamento).
- Mensagem e comportamento fora do expediente.
- Limite máximo de tentativas inválidas e mensagem de fallback.

### 6. Test Mode (Simulador em Memória)
- Ferramenta para testar qualquer fluxo e etapa passo a passo.
- Exibe em tempo real:
  - Entrada normalizada
  - Regra reconhecida e motivo
  - Próxima etapa
  - Ação executada
  - Pré-visualização da mensagem de resposta
  - Status de criação de task humana
  - **Sem necessidade de conexão WhatsApp e sem persistência em banco.**

---

## 🛡️ Proteções de Estabilidade
- **Prevenção contra Loops:** Detector de ciclo oscilatório (`A ➔ B ➔ A ➔ B ➔ A`) e limite de transições por contato (padrão 15).
- **Idempotência com TTL:** Previne respostas duplicadas a um mesmo evento recebido em um intervalo de 60 segundos.
- **Timeouts Efêmeros:** Limpeza periódica em memória de contatos inativos.
