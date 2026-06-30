const fs = require('fs');
const path = 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '  const tabSecciones = (';
const endMarker = '  const tabSeguimiento = (';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('Could not find markers:', startIdx, endIdx);
  process.exit(1);
}

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const newTabSecciones = `  const tabSecciones = (
    <ExpedienteSections
      expediente={expediente}
      completeness={completeness}
      draftValues={draftValues}
      onDraftChange={handleDraftChange}
      onSaveSection={handleSaveSection}
      onCandidateTechnologyToggle={handleCandidateTechnologyToggle}
      lockedSections={lockedSections}
      onUnlockIdentification={() => {
        setLockedSections((prev) => {
          const next = new Set(prev);
          next.delete('identification');
          return next;
        });
      }}
      savingSection={savingSection}
    />
  );

`;

fs.writeFileSync(path, before + newTabSecciones + after, 'utf8');
console.log('Replacement successful. New length:', (before + newTabSecciones + after).length);
