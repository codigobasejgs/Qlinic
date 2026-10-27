// Catálogo fictício por segmento: profissionais, serviços, recursos, pacientes.
import type { ResourceKind, Segment } from '@/domain/types'

export interface SegmentCatalog {
  professionals: { name: string; council: string; specialty: string }[]
  services: { name: string; category: string; duration: number; buffer: number; price: number; kinds: ResourceKind[]; code?: string; publicBookable?: boolean; deposit?: number }[]
  resources: { kind: ResourceKind; name: string }[]
  patientNames: string[]
  animals?: { name: string; species: string; breed: string; sex: 'F' | 'M'; coat: string; kg: number }[]
}

const HUMANS = [
  'Ana Beatriz Moura', 'Bruno Henrique Teles', 'Carla Nogueira Prado', 'Diego Fernandes Lopes', 'Eduarda Siqueira Rocha', 'Felipe Antunes Barros',
  'Gabriela Matos Viana', 'Heitor Cavalcanti Reis', 'Isabela Duarte Campos', 'João Pedro Albuquerque', 'Larissa Pinheiro Costa', 'Marcelo Tavares Lima',
  'Natália Rezende Fonseca', 'Otávio Brandão Sales', 'Paula Guimarães Freitas', 'Rafael Monteiro Dias', 'Sabrina Lacerda Alves', 'Tiago Moreira Neves',
  'Valentina Ribeiro Cunha', 'Wagner Assis Peixoto',
]

export const CATALOG: Record<Segment, SegmentCatalog> = {
  odontologia: {
    professionals: [
      { name: 'Dra. Marina Albuquerque', council: 'CRO-SP 00001 (fictício)', specialty: 'Clínica geral e dentística' },
      { name: 'Dr. Ricardo Paiva', council: 'CRO-SP 00002 (fictício)', specialty: 'Ortodontia' },
      { name: 'Dra. Juliana Castro', council: 'CRO-SP 00003 (fictício)', specialty: 'Periodontia e implantodontia' },
      { name: 'Dr. André Lemos', council: 'CRO-SP 00004 (fictício)', specialty: 'Endodontia' },
    ],
    services: [
      { name: 'Avaliação odontológica', category: 'Consulta', duration: 40, buffer: 10, price: 15000, kinds: ['cadeira'], publicBookable: true },
      { name: 'Profilaxia (limpeza)', category: 'Prevenção', duration: 50, buffer: 10, price: 25000, kinds: ['cadeira'], publicBookable: true },
      { name: 'Restauração em resina', category: 'Dentística', duration: 60, buffer: 10, price: 32000, kinds: ['cadeira'], code: 'DEMO-85100196' },
      { name: 'Tratamento endodôntico', category: 'Endodontia', duration: 90, buffer: 15, price: 120000, kinds: ['cadeira'] },
      { name: 'Extração simples', category: 'Cirurgia', duration: 45, buffer: 15, price: 28000, kinds: ['cadeira'] },
      { name: 'Coroa em cerâmica', category: 'Prótese', duration: 60, buffer: 10, price: 210000, kinds: ['cadeira'] },
      { name: 'Implante unitário', category: 'Implantodontia', duration: 120, buffer: 20, price: 380000, kinds: ['cadeira'], deposit: 20 },
      { name: 'Manutenção ortodôntica', category: 'Ortodontia', duration: 30, buffer: 5, price: 22000, kinds: ['cadeira'], publicBookable: true },
      { name: 'Clareamento em consultório', category: 'Estética dental', duration: 90, buffer: 10, price: 95000, kinds: ['cadeira'] },
      { name: 'Raspagem periodontal (quadrante)', category: 'Periodontia', duration: 50, buffer: 10, price: 30000, kinds: ['cadeira'] },
    ],
    resources: [
      { kind: 'cadeira', name: 'Cadeira 1' }, { kind: 'cadeira', name: 'Cadeira 2' }, { kind: 'cadeira', name: 'Cadeira 3' },
      { kind: 'equipamento', name: 'Raio-X panorâmico' }, { kind: 'equipamento', name: 'Autoclave A' },
    ],
    patientNames: HUMANS,
  },
  medicina: {
    professionals: [
      { name: 'Dr. Fernando Queiroz', council: 'CRM-MG 00011 (fictício)', specialty: 'Clínica médica' },
      { name: 'Dra. Helena Bastos', council: 'CRM-MG 00012 (fictício)', specialty: 'Pediatria' },
      { name: 'Dr. Caio Menezes', council: 'CRM-MG 00013 (fictício)', specialty: 'Cardiologia' },
      { name: 'Dra. Renata Sampaio', council: 'CRM-MG 00014 (fictício)', specialty: 'Dermatologia' },
    ],
    services: [
      { name: 'Consulta clínica', category: 'Consulta', duration: 30, buffer: 5, price: 30000, kinds: ['consultorio'], publicBookable: true, code: 'DEMO-10101012' },
      { name: 'Consulta pediátrica', category: 'Consulta', duration: 30, buffer: 5, price: 32000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Consulta cardiológica', category: 'Consulta', duration: 40, buffer: 5, price: 42000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Eletrocardiograma', category: 'Exame', duration: 20, buffer: 5, price: 12000, kinds: ['equipamento'] },
      { name: 'Retorno', category: 'Consulta', duration: 20, buffer: 5, price: 0, kinds: ['consultorio'] },
      { name: 'Consulta dermatológica', category: 'Consulta', duration: 30, buffer: 5, price: 38000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Pequena cirurgia ambulatorial', category: 'Procedimento', duration: 60, buffer: 15, price: 85000, kinds: ['sala'] },
    ],
    resources: [
      { kind: 'consultorio', name: 'Consultório 1' }, { kind: 'consultorio', name: 'Consultório 2' }, { kind: 'consultorio', name: 'Consultório 3' },
      { kind: 'sala', name: 'Sala de procedimentos' }, { kind: 'equipamento', name: 'Eletrocardiógrafo' },
    ],
    patientNames: HUMANS,
  },
  veterinaria: {
    professionals: [
      { name: 'Dra. Camila Torres', council: 'CRMV-PR 00021 (fictício)', specialty: 'Clínica de pequenos animais' },
      { name: 'Dr. Gustavo Prates', council: 'CRMV-PR 00022 (fictício)', specialty: 'Cirurgia' },
      { name: 'Dra. Lívia Amaral', council: 'CRMV-PR 00023 (fictício)', specialty: 'Felinos' },
    ],
    services: [
      { name: 'Consulta veterinária', category: 'Consulta', duration: 30, buffer: 10, price: 18000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Vacinação', category: 'Prevenção', duration: 20, buffer: 5, price: 12000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Castração', category: 'Cirurgia', duration: 90, buffer: 30, price: 65000, kinds: ['sala'], deposit: 30 },
      { name: 'Internação (diária)', category: 'Internação', duration: 60, buffer: 0, price: 35000, kinds: ['box'] },
      { name: 'Banho', category: 'Estética animal', duration: 60, buffer: 10, price: 7000, kinds: ['equipamento'], publicBookable: true },
      { name: 'Banho e tosa', category: 'Estética animal', duration: 90, buffer: 10, price: 11000, kinds: ['equipamento'], publicBookable: true },
      { name: 'Retorno', category: 'Consulta', duration: 20, buffer: 5, price: 0, kinds: ['consultorio'] },
    ],
    resources: [
      { kind: 'consultorio', name: 'Consultório A' }, { kind: 'consultorio', name: 'Consultório B' }, { kind: 'sala', name: 'Centro cirúrgico' },
      { kind: 'box', name: 'Box 1' }, { kind: 'box', name: 'Box 2' }, { kind: 'box', name: 'Box 3' }, { kind: 'box', name: 'Box 4' },
      { kind: 'equipamento', name: 'Mesa de banho e tosa' },
    ],
    patientNames: ['Thor', 'Luna', 'Mel', 'Bob', 'Nina', 'Simba', 'Fred', 'Amora', 'Pipoca', 'Zeca', 'Mia', 'Paçoca', 'Tobias', 'Lola', 'Chico', 'Frida'],
    animals: [
      { name: 'Thor', species: 'Cão', breed: 'Labrador', sex: 'M', coat: 'Amarelo', kg: 32 },
      { name: 'Luna', species: 'Gato', breed: 'SRD', sex: 'F', coat: 'Tricolor', kg: 4.1 },
      { name: 'Mel', species: 'Cão', breed: 'Shih-tzu', sex: 'F', coat: 'Branco e dourado', kg: 6.2 },
      { name: 'Bob', species: 'Cão', breed: 'SRD', sex: 'M', coat: 'Caramelo', kg: 14.5 },
      { name: 'Nina', species: 'Gato', breed: 'Siamês', sex: 'F', coat: 'Seal point', kg: 3.6 },
      { name: 'Simba', species: 'Gato', breed: 'Persa', sex: 'M', coat: 'Laranja', kg: 5.0 },
      { name: 'Fred', species: 'Cão', breed: 'Bulldog francês', sex: 'M', coat: 'Tigrado', kg: 11.8 },
      { name: 'Amora', species: 'Cão', breed: 'Poodle', sex: 'F', coat: 'Preto', kg: 7.4 },
      { name: 'Pipoca', species: 'Coelho', breed: 'Mini lop', sex: 'F', coat: 'Branco', kg: 1.8 },
      { name: 'Zeca', species: 'Cão', breed: 'Border collie', sex: 'M', coat: 'Preto e branco', kg: 19.0 },
      { name: 'Mia', species: 'Gato', breed: 'SRD', sex: 'F', coat: 'Cinza', kg: 3.9 },
      { name: 'Paçoca', species: 'Cão', breed: 'Dachshund', sex: 'M', coat: 'Marrom', kg: 8.3 },
    ],
  },
  estetica: {
    professionals: [
      { name: 'Dra. Beatriz Valente', council: 'CRM-SC 00031 (fictício)', specialty: 'Dermatologia estética' },
      { name: 'Priscila Moraes', council: 'Esteticista (fictício)', specialty: 'Estética corporal' },
      { name: 'Dra. Sofia Rangel', council: 'CRBM 00033 (fictício)', specialty: 'Biomedicina estética' },
    ],
    services: [
      { name: 'Avaliação estética', category: 'Consulta', duration: 40, buffer: 10, price: 0, kinds: ['sala'], publicBookable: true },
      { name: 'Toxina botulínica (região)', category: 'Injetáveis', duration: 40, buffer: 10, price: 120000, kinds: ['sala'] },
      { name: 'Preenchimento com ácido hialurônico', category: 'Injetáveis', duration: 60, buffer: 15, price: 180000, kinds: ['sala'], deposit: 30 },
      { name: 'Limpeza de pele', category: 'Facial', duration: 60, buffer: 10, price: 22000, kinds: ['sala'], publicBookable: true },
      { name: 'Drenagem linfática', category: 'Corporal', duration: 50, buffer: 10, price: 18000, kinds: ['sala'], publicBookable: true },
      { name: 'Radiofrequência (sessão)', category: 'Corporal', duration: 45, buffer: 10, price: 25000, kinds: ['equipamento'] },
      { name: 'Peeling químico', category: 'Facial', duration: 45, buffer: 10, price: 35000, kinds: ['sala'] },
    ],
    resources: [{ kind: 'sala', name: 'Sala Facial' }, { kind: 'sala', name: 'Sala Corporal' }, { kind: 'sala', name: 'Sala Injetáveis' }, { kind: 'equipamento', name: 'Radiofrequência RF-1' }],
    patientNames: HUMANS,
  },
  psicologia: {
    professionals: [
      { name: 'Ma. Letícia Furtado', council: 'CRP-07/00041 (fictício)', specialty: 'Terapia cognitivo-comportamental' },
      { name: 'Me. Rodrigo Saldanha', council: 'CRP-07/00042 (fictício)', specialty: 'Psicologia clínica de adolescentes' },
      { name: 'Dra. Cecília Barreto', council: 'CRP-07/00043 (fictício)', specialty: 'Psicanálise' },
    ],
    services: [
      { name: 'Primeira sessão (acolhimento)', category: 'Sessão', duration: 50, buffer: 10, price: 22000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Sessão individual', category: 'Sessão', duration: 50, buffer: 10, price: 20000, kinds: ['consultorio'] },
      { name: 'Sessão online', category: 'Teleatendimento', duration: 50, buffer: 10, price: 20000, kinds: [], publicBookable: true },
      { name: 'Sessão com responsáveis', category: 'Sessão', duration: 50, buffer: 10, price: 22000, kinds: ['consultorio'] },
    ],
    resources: [{ kind: 'consultorio', name: 'Sala Ipê' }, { kind: 'consultorio', name: 'Sala Jacarandá' }, { kind: 'consultorio', name: 'Sala Araucária' }],
    patientNames: HUMANS,
  },
  fisioterapia: {
    professionals: [
      { name: 'Dr. Lucas Veloso', council: 'CREFITO-1 00051-F (fictício)', specialty: 'Ortopedia e esporte' },
      { name: 'Dra. Mariana Leite', council: 'CREFITO-1 00052-F (fictício)', specialty: 'Neurofuncional' },
      { name: 'Dr. Pedro Arruda', council: 'CREFITO-1 00053-F (fictício)', specialty: 'Pilates clínico' },
    ],
    services: [
      { name: 'Avaliação fisioterapêutica', category: 'Avaliação', duration: 60, buffer: 10, price: 20000, kinds: ['sala'], publicBookable: true },
      { name: 'Sessão de fisioterapia', category: 'Sessão', duration: 50, buffer: 10, price: 15000, kinds: ['sala'] },
      { name: 'Pilates clínico', category: 'Sessão', duration: 50, buffer: 10, price: 12000, kinds: ['equipamento'], publicBookable: true },
      { name: 'Reavaliação', category: 'Avaliação', duration: 40, buffer: 10, price: 15000, kinds: ['sala'] },
    ],
    resources: [{ kind: 'sala', name: 'Box de atendimento 1' }, { kind: 'sala', name: 'Box de atendimento 2' }, { kind: 'equipamento', name: 'Reformer 1' }, { kind: 'equipamento', name: 'Reformer 2' }],
    patientNames: HUMANS,
  },
  nutricao: {
    professionals: [
      { name: 'Nut. Amanda Cordeiro', council: 'CRN-1 00061 (fictício)', specialty: 'Nutrição clínica' },
      { name: 'Nut. Vinícius Rocha', council: 'CRN-1 00062 (fictício)', specialty: 'Nutrição esportiva' },
    ],
    services: [
      { name: 'Consulta nutricional', category: 'Consulta', duration: 60, buffer: 10, price: 25000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Retorno nutricional', category: 'Consulta', duration: 40, buffer: 10, price: 15000, kinds: ['consultorio'], publicBookable: true },
      { name: 'Bioimpedância', category: 'Avaliação', duration: 20, buffer: 5, price: 8000, kinds: ['equipamento'] },
      { name: 'Consulta online', category: 'Teleatendimento', duration: 50, buffer: 10, price: 22000, kinds: [], publicBookable: true },
    ],
    resources: [{ kind: 'consultorio', name: 'Consultório 1' }, { kind: 'consultorio', name: 'Consultório 2' }, { kind: 'equipamento', name: 'Balança de bioimpedância' }],
    patientNames: HUMANS,
  },
}

export const TUTOR_NAMES = ['Mariana Lopes Arantes', 'Roberto Câmara Neto', 'Fernanda Vilela Souto', 'Paulo César Brito', 'Jéssica Andrade Mota', 'Leonardo Faria Galvão', 'Patrícia Holanda Reis', 'Sérgio Quintela Ramos']
