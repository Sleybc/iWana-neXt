'use strict';
/**
 * Restructura page.tsx para arquitectura 6-tabs.
 * Lee el ORIGINAL (HEAD) y produce la nueva version.
 * Ejecutar desde raiz del monorepo: node scripts/restructure-page.cjs
 */
const fs = require('fs');
const PAGE_PATH = 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx';

// Leer original y normalizar saltos de línea (CRLF → LF)
let src = fs.readFileSync(PAGE_PATH, 'utf8').replace(/\r\n/g, '\n');

// Parche 1: LayoutDashboard a lucide-react (orden alfabetico)
src = src.replace('  History,\n  Loader2,', '  History,\n  LayoutDashboard,\n  Loader2,');

// Parche 2: reemplazar import PageHeader con nuevos imports
src = src.replace(
  "import { PageHeader } from '@/components/layout/PageHeader';",
  [
    "import { ExpedienteHeader } from '@/components/crm/expedientes/ExpedienteHeader';",
    "import { ContactAttemptsPanel } from '@/components/crm/expedientes/ContactAttemptsPanel';",
    "import { ConsentsPanel } from '@/components/crm/expedientes/ConsentsPanel';",
    "import { CoverageChecksPanel } from '@/components/crm/expedientes/CoverageChecksPanel';",
  ].join('\n'),
);

const lines = src.split('\n');

// Deindentacion
function deindent(arr, spaces) {
  const prefix = ' '.repeat(spaces);
  return arr.map((line) =>
    line.startsWith(prefix) ? line.slice(spaces) : line.trim() === '' ? '' : line,
  );
}

// Buscar patron en lineas
function findIdx(pattern, fromIdx) {
  fromIdx = fromIdx || 0;
  for (let i = fromIdx; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  throw new Error('Pattern not found: ' + pattern);
}

// Localizar limites
const OVERALL_PROGRESS_IDX = findIdx(/const overallProgress = Math\.max/);
const RETURN_START_IDX = findIdx(/return \(/, OVERALL_PROGRESS_IDX);
const GESTION_HEADER_IDX = findIdx(/Gesti.n comercial y operativa/, RETURN_START_IDX);
const GESTION_CC_IDX = findIdx(/<CardContent/, GESTION_HEADER_IDX);
const GESTION_CONTENT_START = GESTION_CC_IDX + 1;
const SECCIONES_TITLE_IDX = findIdx(/Secciones de la oportunidad/, GESTION_CC_IDX);
const SECCIONES_CARD_OPEN_IDX = findIdx(/<Card>/, SECCIONES_TITLE_IDX - 5);
const GESTION_CONTENT_END = SECCIONES_CARD_OPEN_IDX - 4;
const DIVIDE_Y_IDX = findIdx(/divide-y divide-gray-100/, SECCIONES_TITLE_IDX);
const ACCORDION_END_DIV_IDX = findIdx(/^\s{14}<\/div>/, DIVIDE_Y_IDX + 1);
const ACCIONES_CARD_IDX = findIdx(/Acciones de pipeline/, ACCORDION_END_DIV_IDX);
const ACCIONES_CC_IDX = findIdx(/<CardContent>/, ACCIONES_CARD_IDX);
const PIPELINE_CONTENT_START = ACCIONES_CC_IDX + 1;
const PIPELINE_CONTENT_END = findIdx(/<\/CardContent>/, PIPELINE_CONTENT_START) - 1;
const ASIDE_START = findIdx(/<aside\s/, PIPELINE_CONTENT_END);
const ASIDE_CONTENT_START = ASIDE_START + 1;
const ASIDE_CLOSE_IDX = findIdx(/<\/aside>/, ASIDE_START);
const ASIDE_CONTENT_END = ASIDE_CLOSE_IDX - 1;

console.log('Boundaries:');
console.log('  OVERALL_PROGRESS_IDX  =', OVERALL_PROGRESS_IDX);
console.log('  GESTION_CONTENT:', GESTION_CONTENT_START, '-', GESTION_CONTENT_END);
console.log('  ACCORDION:', DIVIDE_Y_IDX, '-', ACCORDION_END_DIV_IDX);
console.log('  PIPELINE:', PIPELINE_CONTENT_START, '-', PIPELINE_CONTENT_END);
console.log('  ASIDE:', ASIDE_CONTENT_START, '-', ASIDE_CONTENT_END);

// Extraer y desindentar bloques
// Accordion: divide-y div y su cierre (14sp -> 6sp, deindent 8)
const accordionLines = deindent(lines.slice(DIVIDE_Y_IDX, ACCORDION_END_DIV_IDX + 1), 8);

// Gestion content (14sp -> 4sp, deindent 10)
const gestionLines = deindent(lines.slice(GESTION_CONTENT_START, GESTION_CONTENT_END + 1), 10);

// Pipeline actions content (14sp -> 6sp, deindent 8)
const pipelineLines = deindent(lines.slice(PIPELINE_CONTENT_START, PIPELINE_CONTENT_END + 1), 8);

// Aside cards content (10sp -> 4sp, deindent 6)
const asideLines = deindent(lines.slice(ASIDE_CONTENT_START, ASIDE_CONTENT_END + 1), 6);

// Construir nuevo archivo
const newParts = [];

// 1. Todo el codigo hasta const overallProgress (inclusive)
newParts.push(...lines.slice(0, OVERALL_PROGRESS_IDX + 1));
newParts.push('');

// 2. completedSections
newParts.push(
  '  const completedSections = SECTIONS.filter((s) => (sectionCompletionById[s.id] ?? 0) >= 100).length;',
);
newParts.push('');

// tabVistaGeneral
newParts.push('  const tabVistaGeneral = (');
newParts.push('    <div className="space-y-6">');
newParts.push('      {actionMessage && (');
newParts.push(
  '        <p className="rounded-xl border border-iwana-primary/15 bg-iwana-primary/5 px-4 py-3 text-sm text-iwana-primary dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 dark:text-iwana-primary-200">',
);
newParts.push('          {actionMessage}');
newParts.push('        </p>');
newParts.push('      )}');
newParts.push('      {expediente.dataConsentRevoked && (');
newParts.push(
  '        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">',
);
newParts.push('          El consentimiento de tratamiento de datos fue revocado.');
newParts.push('        </p>');
newParts.push('      )}');
newParts.push('      {/* Progreso general */}');
newParts.push(
  '      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-dark-border dark:bg-dark-surface-3">',
);
newParts.push(
  '        <div className="mb-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">',
);
newParts.push('          <span className="font-medium">Completitud general</span>');
newParts.push(
  '          <span className="font-semibold text-gray-900 dark:text-white">{overallProgress}%</span>',
);
newParts.push('        </div>');
newParts.push('        <progress');
newParts.push('          value={overallProgress}');
newParts.push('          max={100}');
newParts.push(
  '          className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-iwana-primary dark:[&::-webkit-progress-bar]:bg-dark-surface-4 dark:[&::-webkit-progress-value]:bg-iwana-secondary [&::-moz-progress-bar]:bg-iwana-primary dark:[&::-moz-progress-bar]:bg-iwana-secondary"',
);
newParts.push('        />');
newParts.push('      </div>');
newParts.push('      {/* Tarjetas de dimension */}');
newParts.push('      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">');

['commercial', 'technical', 'legal', 'operational'].forEach((dim) => {
  const labels = {
    commercial: 'Comercial',
    technical: 'Tecnica',
    legal: 'Legal',
    operational: 'Operativa',
  };
  const label = labels[dim];
  const pctExpr = 'completenessSnapshot.' + dim;
  newParts.push(
    '        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">',
  );
  newParts.push('          <div className="mb-3 flex items-center justify-between">');
  newParts.push(
    '            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">' +
      label +
      '</p>',
  );
  newParts.push('            <Badge');
  newParts.push('              variant={');
  newParts.push(
    '                ' +
      pctExpr +
      " >= 80 ? 'success' : " +
      pctExpr +
      " >= 40 ? 'warning' : 'neutral'",
  );
  newParts.push('              }');
  newParts.push('            >');
  newParts.push('              {' + pctExpr + '}%');
  newParts.push('            </Badge>');
  newParts.push('          </div>');
  newParts.push('          <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">');
  newParts.push('            {DIMENSION_SECTION_GROUPS.' + dim + '.map((sId) => {');
  newParts.push('              const sec = SECTIONS.find((s) => s.id === sId);');
  newParts.push('              const pct = sectionCompletionById[sId] ?? 0;');
  newParts.push('              return sec ? (');
  newParts.push(
    '                <li key={sId} className="flex items-center justify-between gap-2">',
  );
  newParts.push('                  <span className="truncate">{sec.label}</span>');
  newParts.push(
    "                  <span className={pct >= 100 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}>",
  );
  newParts.push('                    {pct}%');
  newParts.push('                  </span>');
  newParts.push('                </li>');
  newParts.push('              ) : null;');
  newParts.push('            })}');
  newParts.push('          </ul>');
  newParts.push('        </div>');
});

newParts.push('      </div>');
newParts.push('      {/* Informacion del caso */}');
newParts.push(
  '      <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2 xl:grid-cols-4">',
);
newParts.push('        <div>');
newParts.push(
  '          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Estado actual</p>',
);
newParts.push('          <div className="mt-2">');
newParts.push('            <Badge variant={EXPEDIENTE_STATUS_META[expediente.status].variant}>');
newParts.push('              {EXPEDIENTE_STATUS_META[expediente.status].label}');
newParts.push('            </Badge>');
newParts.push('          </div>');
newParts.push('        </div>');
newParts.push('        <div>');
newParts.push(
  '          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Fuente</p>',
);
newParts.push('          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">');
newParts.push('            {formatAcquisitionChannel(expediente.acquisitionChannel)}');
newParts.push('          </p>');
newParts.push('          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">');
newParts.push("            {expediente.sourceDetail || 'Sin detalle de origen'}");
newParts.push('          </p>');
newParts.push('        </div>');
newParts.push('        <div>');
newParts.push(
  '          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Municipio</p>',
);
newParts.push('          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">');
newParts.push("            {expediente.municipality || 'Sin municipio'}");
newParts.push('          </p>');
newParts.push('        </div>');
newParts.push('        <div>');
newParts.push(
  '          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Responsable</p>',
);
newParts.push('          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">');
newParts.push("            {responsibility?.currentResponsible?.name || 'Sin responsable'}");
newParts.push('          </p>');
newParts.push('          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">');
newParts.push("            {responsibility?.currentResponsible?.role || ''}");
newParts.push('          </p>');
newParts.push('        </div>');
newParts.push('      </div>');
newParts.push('      {/* Acciones de pipeline */}');
newParts.push(
  '      <div className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-dark-border dark:bg-dark-surface-2">',
);
newParts.push(
  '        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">',
);
newParts.push('          Acciones de pipeline');
newParts.push('        </p>');
pipelineLines.forEach((l) => newParts.push('    ' + l));
newParts.push('      </div>');
newParts.push('    </div>');
newParts.push('  );');
newParts.push('');

// tabSecciones
newParts.push('  const tabSecciones = (');
newParts.push('    <div className="space-y-6">');
newParts.push('      {/* Cabecera de progreso */}');
newParts.push(
  '      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 dark:border-dark-border dark:bg-dark-surface-3">',
);
newParts.push('        <div className="space-y-1">');
newParts.push('          <p className="text-sm font-semibold text-gray-900 dark:text-white">');
newParts.push('            {completedSections} de {SECTIONS.length} secciones completadas');
newParts.push('          </p>');
newParts.push('          <p className="text-xs text-gray-500 dark:text-gray-400">');
newParts.push('            Completa las ocho zonas segun avance el caso.');
newParts.push('          </p>');
newParts.push('        </div>');
newParts.push('        <div className="text-sm font-semibold text-gray-900 dark:text-white">');
newParts.push('          {overallProgress}%');
newParts.push('        </div>');
newParts.push('      </div>');
newParts.push('      {/* Accordion de secciones */}');
newParts.push(
  '      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-dark-border">',
);
accordionLines.forEach((l) => newParts.push('    ' + l));
newParts.push('      </div>');
newParts.push('    </div>');
newParts.push('  );');
newParts.push('');

// tabSeguimiento
newParts.push('  const tabSeguimiento = (');
newParts.push('    <div className="space-y-6">');
newParts.push('      {/* Panel de intentos de contacto */}');
newParts.push('      <ContactAttemptsPanel expedienteId={expediente.id} />');
newParts.push('      {/* Datos de gestion comercial */}');
gestionLines.forEach((l) => newParts.push('    ' + l));
newParts.push('    </div>');
newParts.push('  );');
newParts.push('');

// tabContexto
newParts.push('  const tabContexto = (');
newParts.push('    <div className="space-y-6">');
asideLines.forEach((l) => newParts.push('    ' + l));
newParts.push('    </div>');
newParts.push('  );');
newParts.push('');

// Return final
newParts.push('  return (');
newParts.push('    <div className="space-y-6 pb-6">');
newParts.push('      <ExpedienteHeader');
newParts.push('        fullName={expediente.fullName}');
newParts.push('        status={expediente.status}');
newParts.push('        overallProgress={overallProgress}');
newParts.push(
  '        subtitle={`Oportunidad ${expediente.id.slice(0, 8).toUpperCase()} \u00b7 Gesti\u00f3n progresiva comercial y operativa.`}',
);
newParts.push('      />');
newParts.push('      <div className="px-6">');
newParts.push('        <ExpedienteTabsContainer');
newParts.push('          defaultTab="vista-general"');
newParts.push('          tabs={[');
newParts.push('            {');
newParts.push("              id: 'vista-general', label: 'Vista general',");
newParts.push('              icon: <LayoutDashboard className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: tabVistaGeneral,');
newParts.push('            },');
newParts.push('            {');
newParts.push("              id: 'secciones', label: 'Secciones',");
newParts.push('              icon: <FileText className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: tabSecciones,');
newParts.push('            },');
newParts.push('            {');
newParts.push("              id: 'seguimiento', label: 'Seguimiento',");
newParts.push('              icon: <Phone className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: tabSeguimiento,');
newParts.push('            },');
newParts.push('            {');
newParts.push("              id: 'consentimientos', label: 'Consentimientos',");
newParts.push('              icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: <ConsentsPanel expedienteId={expediente.id} />,');
newParts.push('            },');
newParts.push('            {');
newParts.push("              id: 'cobertura', label: 'Cobertura',");
newParts.push('              icon: <MapPin className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: <CoverageChecksPanel expedienteId={expediente.id} />,');
newParts.push('            },');
newParts.push('            {');
newParts.push("              id: 'contexto', label: 'Contexto',");
newParts.push('              icon: <History className="h-4 w-4" aria-hidden="true" />,');
newParts.push('              content: tabContexto,');
newParts.push('            },');
newParts.push('          ]}');
newParts.push('        />');
newParts.push('      </div>');
newParts.push('    </div>');
newParts.push('  );');
newParts.push('}');
newParts.push('');

fs.writeFileSync(PAGE_PATH, newParts.join('\n'), 'utf8');
console.log('Done. New file has', newParts.join('\n').split('\n').length, 'lines.');
