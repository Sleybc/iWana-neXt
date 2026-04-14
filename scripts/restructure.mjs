const fs = require('fs');
const fp = 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx';
const lines = fs.readFileSync(fp, 'utf8').split('\n');
const KEEP_END = 1228;
const GESTION_CONTENT_START = 1241;
const GESTION_CONTENT_END = 1630;
const ACCORDION_START = 1655;
const ACCORDION_END = 2436;
const ASIDE_START = 2538;
const ASIDE_END = 2680;
const deindent = (l, spaces) => {
  const prefix = ' '.repeat(spaces);
  return l.startsWith(prefix) ? l.substring(spaces) : l;
};
const keepLines = lines.slice(0, KEEP_END);
const accordionLines = lines.slice(ACCORDION_START, ACCORDION_END + 1).map(l => deindent(l, 10));
const gestionLines = lines.slice(GESTION_CONTENT_START, GESTION_CONTENT_END + 1).map(l => deindent(l, 8));
const asideLines = lines.slice(ASIDE_START, ASIDE_END + 1).map(l => deindent(l, 4));
const finalReturn = [
  '    <div className="space-y-6 pb-6">',
  '      <ExpedienteHeader',
  '        fullName={expediente.fullName}',
  '        status={expediente.status}',
  '        overallProgress={overallProgress}',
  '        subtitle={`Oportunidad ${expediente.id.slice(0, 8).toUpperCase()} \u00b7 Gesti\u00f3n progresiva comercial y operativa.`}',
  '      />',
  '      <div className="px-6">',
  '        <ExpedienteTabsContainer',
  "          defaultTab='vista-general'",
  '          tabs={[',
  "            { id: 'vista-general', label: 'Vista general', icon: <LayoutDashboard className=\"h-4 w-4\" aria-hidden=\"true\" />, content: tabVistaGeneral },",
  "            { id: 'secciones', label: 'Secciones', icon: <FileText className=\"h-4 w-4\" aria-hidden=\"true\" />, content: tabSecciones },",
  "            { id: 'seguimiento', label: 'Seguimiento', icon: <Phone className=\"h-4 w-4\" aria-hidden=\"true\" />, content: tabSeguimiento },",
  "            { id: 'consentimientos', label: 'Consentimientos', icon: <ShieldCheck className=\"h-4 w-4\" aria-hidden=\"true\" />, content: <ConsentsPanel expedienteId={expediente.id} /> },",
  "            { id: 'cobertura', label: 'Cobertura', icon: <MapPin className=\"h-4 w-4\" aria-hidden=\"true\" />, content: <CoverageChecksPanel expedienteId={expediente.id} /> },",
  "            { id: 'contexto', label: 'Contexto', icon: <History className=\"h-4 w-4\" aria-hidden=\"true\" />, content: tabContexto },",
  '          ]}',
  '        />',
  '      </div>',
  '    </div>',
  '  );',
  '}',
  '',
];
const newParts = [
  ...keepLines,
  ...accordionLines,
  '    </div>',
  '  );',
  '',
  '  // Tab 3: Seguimiento',
  '  const tabSeguimiento = (',
  '    <div className="space-y-6">',
  '      <ContactAttemptsPanel expedienteId={expediente.id} />',
  ...gestionLines,
  '    </div>',
  '  );',
  '',
  '  // Tab 6: Contexto',
  '  const tabContexto = (',
  '    <div className="space-y-6">',
  ...asideLines,
  '    </div>',
  '  );',
  '',
  '  return (',
  ...finalReturn,
];
fs.writeFileSync(fp, newParts.join('\n'));
console.log('Done. Lines:', newParts.length);
