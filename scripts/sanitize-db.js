const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'whatsapp_assist.sqlite');
const db = new DatabaseSync(dbPath);

db.exec(`
  DELETE FROM tasks;
  INSERT INTO tasks (id, contact_id, contact_name, title, status, priority, flow_name, step_name, last_message, created_at, updated_at)
  VALUES
    (1, '5511999990001@c.us', 'Ana Souza (Exemplo)', 'Cliente solicitou orçamento', 'PENDING', 'HIGH', 'Primeiro Atendimento', 'Menu Principal', 'Olá, gostaria de saber os valores do serviço', datetime('now'), datetime('now')),
    (2, '5511999990002@c.us', 'Carlos Santos (Exemplo)', 'Dúvida sobre suporte', 'IN_PROGRESS', 'MEDIUM', 'Primeiro Atendimento', 'Suporte Técnico', 'Preciso de ajuda com meu acesso', datetime('now', '-10 minutes'), datetime('now')),
    (3, '5511999990003@c.us', 'Mariana Lima (Exemplo)', 'Atendimento concluído', 'RESOLVED', 'LOW', 'Primeiro Atendimento', 'Encerramento', 'Obrigado pelo atendimento!', datetime('now', '-1 hour'), datetime('now'));
`);

console.log('Database tasks sanitized to 100% fictitious demo data:');
console.log(db.prepare('SELECT id, contact_id, contact_name, title, last_message FROM tasks').all());
