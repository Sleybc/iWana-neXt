import fs from 'fs';

const path = 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf-8');

const anchor = 'const overallProgress = Math.max(completenessSnapshot.overall, sectionsOverallProgress);';
const parts = content.split(anchor);

if (parts.length !== 2) {
  console.error("Could not find the anchor properly");
  process.exit(1);
}

const replacement = anchor + `

  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] pb-6 bg-iwana-bg dark:bg-dark-bg">
      <ExpedienteHeader 
        id={expediente.id}
        fullName={expediente.fullName || 'Oportunidad sin nombre'}
        status={expediente.status}
        overallProgress={overallProgress}
        subtitle={\`Oportunidad ${expediente.id.slice(0, 8).toUpperCase()} \u00b7 Gestión progresiva comercial y operativa.\`}
      />

      <div className="flex-1 mt-4">
        <ExpedienteTabsContainer 
          tabs={[
            {
              id: 'resumen',
              label: 'Resumen',
              icon: <FileText className="h-4 w-4" />,
              content: (
                <div className="grid gap-6 xl:grid-cols-[1fr_minmax(340px,400px)] items-start">
                  <div className="space-y-6">
                    <Card className="border border-gray-100 dark:border-dark-border shadow-iwana-soft rounded-[20px]">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-iwana-primary dark:text-white">
                          <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
                          Gestión comercial y operativa
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Responsable actual, interés del cliente y origen de la oportunidad.
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Status Grid */}
                        <div className="grid gap-4 rounded-2xl border border-gray-100 bg-gray-50/50 p-5 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                              Fuente
                            </p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {formatAcquisitionChannel(expediente.acquisitionChannel)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {expediente.sourceDetail || 'Sin detalle de origen'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                              Municipio
                            </p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {expediente.municipality || 'Sin municipio'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                              Interés
                            </p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {expediente.interestedPlanId || 'No registrado'}
                            </p>
                          </div>
                        </div>

                        {/* Asesor y Responsabilidad */}
                        <div className="rounded-2xl border border-iwana-primary/10 bg-iwana-primary/5 p-5 dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                                Responsable actual
                              </p>
                              {responsibility?.currentResponsible ? (
                                <div>
                                  <p className="font-bold text-gray-900 dark:text-white">
                                    {responsibility.currentResponsible.name || 'Sin nombre'}
                                  </p>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {responsibility.currentResponsible.role || 'Sin rol'}
                                  </p>
                                  {responsibility.currentResponsibleAssignedAt && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                      Asignado el{' '}
                                      {formatCrmDateTime(responsibility.currentResponsibleAssignedAt)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Sin responsable asignado
                                </p>
                              )}
                            </div>
                            {canManageAttribution && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowResponsibilityForm(!showResponsibilityForm)}
                                className="rounded-xl shadow-sm"
                              >
                                {showResponsibilityForm ? 'Cancelar' : 'Cambiar responsable'}
                              </Button>
                            )}
                          </div>

                          {/* Formulario Reasignar */}
                          {showResponsibilityForm && (
                            <div className="mt-5 space-y-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
                              <div>
                                <label
                                  htmlFor="responsibility-user"
                                  className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                >
                                  Nuevo responsable
                                </label>
                                <select
                                  id="responsibility-user"
                                  value={responsibilityForm.responsibleUserId}
                                  onChange={(event) =>
                                    setResponsibilityForm((current) => ({
                                      ...current,
                                      responsibleUserId: event.target.value,
                                    }))
                                  }
                                  disabled={loadingAttributionUsers}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all dark:border-dark-border dark:bg-dark-surface-4"
                                >
                                  <option value="">
                                    {loadingAttributionUsers
                                      ? 'Cargando usuarios...'
                                      : 'Selecciona un usuario activo'}
                                  </option>
                                  {sortedAttributionUsers.map((candidate) => {
                                    const fullName = [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim();
                                    return (
                                      <option key={candidate.id} value={candidate.id}>
                                        {fullName || candidate.email || 'Usuario sin nombre'}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                              <Input
                                id="responsibility-notes"
                                label="Notas (opcional)"
                                value={responsibilityForm.notes}
                                onChange={(event) =>
                                  setResponsibilityForm((current) => ({
                                    ...current,
                                    notes: event.target.value,
                                  }))
                                }
                                placeholder="Motivo de la reasignación"
                              />
                              <div className="flex justify-end gap-3 mt-4">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => {
                                    setShowResponsibilityForm(false);
                                    setResponsibilityForm({ responsibleUserId: '', notes: '' });
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  type="button"
                                  loading={savingResponsibility}
                                  onClick={handleUpdateResponsibility}
                                  className="bg-iwana-primary text-white hover:bg-iwana-primary/95"
                                >
                                  Guardar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Atribución Comercial */}
                        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 dark:border-dark-border dark:bg-dark-surface-3 shadow-sm mt-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                            Atribución comercial (Originador)
                          </p>
                          {currentAttribution ? (
                            <div className="space-y-1">
                              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                                {currentAttribution.actorName}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Rol: {currentAttribution.actorRole} · Canal:{' '}
                                {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Desde: {formatCrmDateTime(currentAttribution.attributedAt)}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Sin atribución comercial activa.
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Metadata y Fechas operativas */}
                    <Card className="border border-gray-100 hover:border-iwana-secondary/30 transition-colors shadow-iwana-soft rounded-[20px] dark:border-dark-border">
                       <CardHeader>
                         <CardTitle className="text-base flex items-center gap-2">
                           <History className="w-5 h-5 text-iwana-primary" />
                           Metadata operativa
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-4">
                         <div className="flex justify-between border-b border-gray-50 dark:border-dark-border pb-3">
                           <span className="text-sm text-gray-500 dark:text-gray-400">Última edición por</span>
                           <span className="text-sm font-semibold">{lastEditedByLabel}</span>
                         </div>
                         <div className="flex justify-between border-b border-gray-50 dark:border-dark-border pb-3">
                           <span className="text-sm text-gray-500 dark:text-gray-400">Última actividad</span>
                           <span className="text-sm font-semibold">
                             {operationalMetadata?.lastActivityAt ? formatCrmDateTime(operationalMetadata.lastActivityAt) : '-'}
                           </span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-sm text-gray-500 dark:text-gray-400">Creado por</span>
                           <span className="text-sm font-semibold">{createdByLabel}</span>
                         </div>
                       </CardContent>
                    </Card>
                  </div>
                  
                  {/* Timeline Lateral */}
                  <div className="bg-white rounded-[20px] p-6 shadow-iwana-soft border border-gray-100 dark:border-dark-border dark:bg-dark-surface-2 self-start sticky top-4">
                    <div className="flex items-center space-x-2 mb-6 text-iwana-primary dark:text-gray-200">
                        <History className="h-5 w-5" />
                        <h2 className="text-lg font-bold">Actividad reciente</h2>
                    </div>

                    <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-gray-200 before:to-transparent dark:before:from-dark-border">
                        {timeline.length === 0 && recentActivity.length === 0 ? (
                           <p className="text-sm text-gray-500 ml-4">No hay actividad registrada.</p>
                        ) : (
                          [...(timeline.map(t => ({...t, _sortDate: new Date(t.changedAt), _type: 'timeline'}) as any)),
                           ...(recentActivity.map(a => ({...a, _sortDate: new Date(a.activityAt), _type: 'activity'}) as any))]
                          .sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
                          .slice(0, 6)
                          .map((item, idx) => {
                            if (item._type === 'timeline') {
                               return (
                                <div key={`tl-${item.id}`} className="relative flex items-start space-x-4">
                                  <div className="absolute left-[-21px] w-3 h-3 bg-iwana-secondary rounded-full border-4 border-white dark:border-dark-bg z-10 shadow-sm ring-1 ring-gray-100 dark:ring-dark-border"></div>
                                  <div className="flex-1">
                                      <div className="flex justify-between items-start gap-2">
                                          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatExpedienteStatus(item.toStatus)}</h4>
                                          <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{formatCrmDate(item.changedAt)}</span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">De {formatExpedienteStatus(item.fromStatus)} por {getActorLabel(item.actor?.name)}</p>
                                  </div>
                                </div>
                               )
                            } else {
                              return (
                                <div key={`ac-${item.id}`} className="relative flex items-start space-x-4">
                                  <div className="absolute left-[-21px] w-3 h-3 bg-iwana-primary/20 dark:bg-iwana-primary-300/40 rounded-full border-4 border-white dark:border-dark-bg z-10 shadow-sm ring-1 ring-gray-100 dark:ring-dark-border"></div>
                                  <div className="flex-1">
                                      <div className="flex justify-between items-start gap-2">
                                          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">{getActivityTitle(item)}</h4>
                                          <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">{formatCrmDate(item.activityAt)}</span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{getActivityDescription(item)}</p>
                                  </div>
                                </div>
                              )
                            }
                          })
                        )}
                    </div>
                  </div>
                </div>
              )
            },
            {
              id: 'secciones',
              label: 'Secciones / Formulario',
              icon: <Wrench className="h-4 w-4" />,
              content: (
                 <div className="max-w-5xl mx-auto bg-white dark:bg-dark-surface-2 rounded-[24px] p-6 lg:p-10 shadow-iwana-soft border border-gray-100 dark:border-dark-border">
                   <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div>
                          <h2 className="text-2xl font-bold tracking-tight mb-1 text-iwana-primary dark:text-white">Secciones de la oportunidad</h2>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Completa las 8 zonas de información para avanzar el caso comercial.</p>
                      </div>
                      <div className="text-left md:text-right bg-iwana-primary/5 dark:bg-iwana-primary/10 px-4 py-2 rounded-2xl">
                          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Tu Progreso</span>
                          <p className="text-lg font-bold text-iwana-secondary-700 dark:text-iwana-secondary-300 leading-none">{sectionsOverallProgress}% completado</p>
                      </div>
                  </div>

                  {actionMessage && (
                    <div className="mb-6 rounded-xl border border-iwana-secondary/30 bg-iwana-secondary/10 px-5 py-3 text-sm font-medium text-iwana-secondary-700 dark:text-iwana-secondary-300 animate-in fade-in slide-in-from-top-4">
                      {actionMessage}
                    </div>
                  )}

                  {/* NUEVO DISEÑO ACORDEÓN APIS (Minimalista, border y progressive) */}
                  <div className="space-y-4">
                    {SECTIONS.map((section) => {
                      const Icon = section.icon;
                      const isExpanded = expandedSection === section.id;
                      const isLocked = lockedSections.has(section.id);
                      const renderFields = getSectionRenderFields(section.id as SectionId, effectivePersonType);
                      const completeness = sectionCompletionById[section.id] ?? 0;
                      
                      return (
                        <div 
                          key={section.id} 
                          className={\`rounded-2xl transition-all duration-300 overflow-hidden \${
                            isExpanded 
                              ? 'border border-iwana-primary/20 shadow-iwana-active bg-white dark:bg-dark-surface-3 dark:border-iwana-primary/30 z-10 relative'
                              : completeness === 100
                                ? 'border border-transparent bg-gray-50/50 hover:bg-gray-50 dark:bg-dark-surface-3/50 dark:hover:bg-dark-surface-3 cursor-pointer group'
                                : 'border border-gray-100 bg-white hover:border-iwana-secondary/30 shadow-sm cursor-pointer group dark:bg-dark-surface-2 dark:border-dark-border dark:hover:border-iwana-secondary/30'
                          }\`}
                        >
                          {/* Header Acordeón */}
                          <div 
                            onClick={() => setExpandedSection(isExpanded ? ('' as SectionId) : section.id)}
                            className={\`p-5 flex items-center justify-between \${isExpanded ? 'border-b border-gray-50 dark:border-dark-border cursor-pointer' : ''}\`}
                          >
                            <div className="flex items-center space-x-4">
                              <div className={\`w-12 h-12 rounded-full flex items-center justify-center transition-colors \${
                                isExpanded 
                                  ? 'bg-[#EDF8CC] text-[#6A7A1C] dark:bg-iwana-secondary/20 dark:text-iwana-secondary-300' 
                                  : completeness === 100
                                    ? 'bg-white text-iwana-secondary-700 shadow-sm dark:bg-dark-surface-4 dark:text-iwana-secondary-300'
                                    : 'bg-gray-100 text-gray-400 group-hover:bg-iwana-secondary/10 group-hover:text-iwana-secondary-700 dark:bg-dark-surface-4 dark:text-gray-500'
                              }\`}>
                                <Icon className="w-6 h-6" />
                              </div>
                              <div>
                                <h3 className={\`font-bold text-[16px] transition-colors \${
                                  isExpanded ? 'text-iwana-primary dark:text-white' : completeness === 100 ? 'group-hover:text-iwana-secondary-700 dark:group-hover:text-iwana-secondary-300' : 'group-hover:text-iwana-primary dark:group-hover:text-white'
                                }\`}>{section.label}</h3>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{section.description}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-4">
                              {completeness === 100 ? (
                                <span className="px-3 py-1 rounded-full bg-[#EDF8CC] text-[#48531D] dark:bg-iwana-secondary/20 dark:text-iwana-secondary-100 text-xs font-bold flex items-center shadow-sm">
                                  ✓ 100%
                                </span>
                              ) : completeness > 0 ? (
                                <span className="px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700/30 text-xs font-bold">
                                  {completeness}%
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-dark-surface-4 dark:text-gray-400 text-xs font-bold">
                                  0%
                                </span>
                              )}
                              
                              <div className={\`w-8 h-8 rounded-full flex items-center justify-center transition-colors \${isExpanded ? 'hover:bg-gray-100 dark:hover:bg-dark-surface-4' : ''}\`}>
                                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-iwana-primary dark:group-hover:text-white transition-colors" />}
                              </div>
                            </div>
                          </div>

                          {/* Cuerpo Formulario Oculto */}
                          {isExpanded && (
                            <div className="p-6 bg-gray-50/30 dark:bg-dark-surface-3/50 animate-in fade-in duration-200">
                                {/* Injected logic exactly based on section.id. We reuse the forms from page.tsx! */}
                                {isLocked && section.id === 'identification' ? (
                                  <div className="space-y-5">
                                    <div className="grid gap-6 md:grid-cols-2">
                                      <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Tipo de persona</p>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{draftValues.personType === 'PERSONA_JURIDICA' ? 'Persona jurídica' : 'Persona natural'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Tipo de documento</p>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{draftValues.documentType || 'No registrado'}</p>
                                      </div>
                                      <div className="md:col-span-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Número de documento</p>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{draftValues.documentNumber || 'No registrado'}</p>
                                      </div>
                                      {draftValues.personType === 'PERSONA_JURIDICA' ? (
                                        <>
                                          <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Razón social</p><p className="text-sm font-medium">{draftValues.companyName || 'No registrado'}</p></div>
                                          <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Contacto principal</p><p className="text-sm font-medium">{draftValues.primaryContactName || 'No registrado'}</p></div>
                                          <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Cargo</p><p className="text-sm font-medium">{draftValues.primaryContactRole || 'No registrado'}</p></div>
                                        </>
                                      ) : (
                                        <>
                                          <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Nombres</p><p className="text-sm font-medium">{draftValues.firstName || 'No registrado'}</p></div>
                                          <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Apellidos</p><p className="text-sm font-medium">{draftValues.lastName || 'No registrado'}</p></div>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex justify-end pt-4">
                                      <Button type="button" variant="secondary" className="shadow-sm" onClick={() => { setLockedSections(c => { const n = new Set(c); n.delete(section.id); return n; }); }}>
                                        Habilitar edición
                                      </Button>
                                    </div>
                                  </div>
                                ) : section.id === 'identification' ? (
                                  <div className="space-y-6">
                                    <div className="grid gap-6 md:grid-cols-2">
                                      <div>
                                        <label htmlFor="personType" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.personType}</label>
                                        <select id="personType" value={draftValues.personType ?? EMPTY_VALUE} onChange={e => handleDraftChange('personType', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                          <option value="">Selecciona el tipo</option>
                                          <option value="PERSONA_NATURAL">Persona natural</option>
                                          <option value="PERSONA_JURIDICA">Persona jurídica</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label htmlFor="documentType" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.documentType}</label>
                                        <select id="documentType" value={draftValues.documentType ?? EMPTY_VALUE} onChange={e => handleDraftChange('documentType', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                          <option value="">Selecciona el tipo</option>
                                          {DOCUMENT_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                        </select>
                                      </div>
                                      <div className="md:col-span-2">
                                        <Input id="documentNumber" label={FIELD_LABELS.documentNumber!} value={draftValues.documentNumber ?? EMPTY_VALUE} onChange={e => handleDraftChange('documentNumber', e.target.value)} placeholder={FIELD_PLACEHOLDERS.documentNumber!} className="!rounded-xl" />
                                      </div>
                                    </div>
                                    {effectivePersonType === 'PERSONA_JURIDICA' ? (
                                      <div className="grid gap-6 md:grid-cols-2">
                                        <div className="md:col-span-2"><Input id="companyName" label={FIELD_LABELS.companyName!} value={draftValues.companyName ?? EMPTY_VALUE} onChange={e => handleDraftChange('companyName', e.target.value)} placeholder={FIELD_PLACEHOLDERS.companyName!} className="!rounded-xl" /></div>
                                        <Input id="primaryContactName" label={FIELD_LABELS.primaryContactName!} value={draftValues.primaryContactName ?? EMPTY_VALUE} onChange={e => handleDraftChange('primaryContactName', e.target.value)} className="!rounded-xl" />
                                        <Input id="primaryContactRole" label={FIELD_LABELS.primaryContactRole!} value={draftValues.primaryContactRole ?? EMPTY_VALUE} onChange={e => handleDraftChange('primaryContactRole', e.target.value)} className="!rounded-xl" />
                                      </div>
                                    ) : (
                                       <div className="grid gap-6 md:grid-cols-2">
                                         <Input id="firstName" label={FIELD_LABELS.firstName!} value={draftValues.firstName ?? EMPTY_VALUE} onChange={e => handleDraftChange('firstName', e.target.value)} className="!rounded-xl" />
                                         <Input id="lastName" label={FIELD_LABELS.lastName!} value={draftValues.lastName ?? EMPTY_VALUE} onChange={e => handleDraftChange('lastName', e.target.value)} className="!rounded-xl" />
                                       </div>
                                    )}
                                    <div className="flex justify-end mt-6 pt-4 border-t border-gray-100 dark:border-dark-border">
                                       <Button type="button" loading={savingSection === section.id} onClick={() => handleSaveSection(section.id as SectionId)} className="bg-iwana-primary text-white rounded-xl shadow-sm">
                                         Guardar e identificar
                                       </Button>
                                    </div>
                                  </div>
                                ) : section.id === 'technical_feasibility' ? (
                                  <div className="space-y-6">
                                     <div className="grid gap-6 md:grid-cols-2">
                                        <Input id="coverageResult" label={FIELD_LABELS.coverageResult!} value={draftValues.coverageResult ?? EMPTY_VALUE} onChange={e => handleDraftChange('coverageResult', e.target.value)} className="!rounded-xl" />
                                        <div>
                                          <label htmlFor="feasibility" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.feasibility}</label>
                                          <select id="feasibility" value={draftValues.feasibility ?? EMPTY_VALUE} onChange={e => handleDraftChange('feasibility', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                            <option value="">Resultado técnico</option>
                                            {TECHNICAL_VIABILITY_RESULT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                          </select>
                                        </div>
                                     </div>
                                     <div>
                                       <p className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">{FIELD_LABELS.candidateTechnologies}</p>
                                       <div className="grid gap-3 p-5 rounded-2xl border border-gray-100 bg-white dark:border-dark-border dark:bg-dark-surface-2 md:grid-cols-2">
                                          {TECHNOLOGY_OPTION_OPTIONS.map(opt => {
                                            const selected = getCandidateTechnologiesFromDraft(draftValues);
                                            const checked = selected.includes(opt.value);
                                            return (
                                              <label key={opt.value} className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                                                <input type="checkbox" checked={checked} onChange={e => handleCandidateTechnologyToggle(opt.value, e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-iwana-secondary-700 focus:ring-iwana-secondary-700" />
                                                {opt.label}
                                              </label>
                                            )
                                          })}
                                       </div>
                                     </div>
                                     <div className="grid gap-6 md:grid-cols-3">
                                       <div>
                                          <label htmlFor="availableTechnology" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.availableTechnology}</label>
                                          <select id="availableTechnology" value={draftValues.availableTechnology ?? EMPTY_VALUE} onChange={e => handleDraftChange('availableTechnology', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                            <option value="">Recomendada</option>
                                            {TECHNOLOGY_OPTION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                          </select>
                                       </div>
                                       <div>
                                          <label htmlFor="technicalConfidence" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.technicalConfidence}</label>
                                          <select id="technicalConfidence" value={draftValues.technicalConfidence ?? EMPTY_VALUE} onChange={e => handleDraftChange('technicalConfidence', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                            <option value="">Nivel de certeza</option>
                                            {TECHNICAL_CONFIDENCE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                          </select>
                                       </div>
                                       <div>
                                          <label htmlFor="evaluationSource" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.evaluationSource}</label>
                                          <select id="evaluationSource" value={draftValues.evaluationSource ?? EMPTY_VALUE} onChange={e => handleDraftChange('evaluationSource', e.target.value)} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all">
                                            <option value="">Fuente de datos</option>
                                            {EVALUATION_SOURCE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                          </select>
                                       </div>
                                     </div>
                                     <div>
                                        <label htmlFor="technicalObservations" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS.technicalObservations}</label>
                                        <textarea id="technicalObservations" value={draftValues.technicalObservations ?? EMPTY_VALUE} onChange={e => handleDraftChange('technicalObservations', e.target.value)} rows={3} placeholder={FIELD_PLACEHOLDERS.technicalObservations!} className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all dark:bg-dark-surface-2 dark:border-dark-border" />
                                     </div>
                                     <div className="flex justify-end mt-6 pt-4 border-t border-gray-100 dark:border-dark-border">
                                       <Button type="button" loading={savingSection === section.id} onClick={() => handleSaveSection(section.id as SectionId)} className="bg-iwana-primary text-white rounded-xl shadow-sm">
                                         Guardar técnica y viabilidad
                                       </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                     <div className="grid gap-6 md:grid-cols-2">
                                       {renderFields.filter(f => f !== 'personType').map(field => {
                                          if (field === 'department' || field === 'municipality') {
                                             const opts = field === 'department' ? DEPARTAMENTOS : getMunicipiosByDepartamento(draftValues['department'] ?? DEPARTAMENTO_DEFAULT);
                                             return (
                                               <div key={field}>
                                                 <label htmlFor={field} className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{FIELD_LABELS[field]}</label>
                                                 <select id={field} value={draftValues[field] ?? (field === 'department' ? DEPARTAMENTO_DEFAULT : EMPTY_VALUE)} onChange={e => handleDraftChange(field, e.target.value)} disabled={field === 'department'} className="w-full bg-white dark:bg-dark-surface-2 border border-gray-200 dark:border-dark-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-secondary focus:border-transparent transition-all disabled:bg-gray-100">
                                                    <option value="">Selecciona</option>
                                                    {opts.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                 </select>
                                               </div>
                                             )
                                          }
                                          if (field === 'altContactName') {
                                            return <div key={field} className="md:col-span-2 border-t border-gray-200 pt-6 mt-2"><Input id={field} label={FIELD_LABELS[field]!} value={draftValues[field] ?? EMPTY_VALUE} onChange={e => handleDraftChange(field, e.target.value)} className="!rounded-xl" /></div>
                                          }
                                          return <Input key={field} id={field} type={(field === 'latitude' || field === 'longitude') ? 'number' : 'text'} label={FIELD_LABELS[field]!} value={draftValues[field] ?? EMPTY_VALUE} onChange={e => handleDraftChange(field, e.target.value)} className="!rounded-xl" />
                                       })}
                                     </div>
                                     <div className="flex justify-end mt-6 pt-4 border-t border-gray-100 dark:border-dark-border">
                                       <Button type="button" loading={savingSection === section.id} onClick={() => handleSaveSection(section.id as SectionId)} className="bg-iwana-primary text-white rounded-xl shadow-sm">
                                         Guardar información
                                       </Button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                 </div>
              )
            },
            {
              id: 'seguimiento',
              label: 'Seguimiento y Citas',
              icon: <Phone className="h-4 w-4" />,
              content: (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-[24px] p-6 lg:p-8 shadow-iwana-soft border border-gray-100 dark:border-dark-border dark:bg-dark-surface-2">
                    <ContactAttemptsPanel expedienteId={expediente.id} />
                  </div>
                </div>
              )
            },
            {
              id: 'consentimientos',
              label: 'Consentimientos Legales',
              icon: <ShieldCheck className="h-4 w-4" />,
              content: (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-[24px] p-6 lg:p-8 shadow-iwana-soft border border-gray-100 dark:border-dark-border dark:bg-dark-surface-2">
                    <ConsentsPanel expedienteId={expediente.id} />
                  </div>
                </div>
              )
            },
            {
              id: 'cobertura',
              label: 'Listado de Cobertura',
              icon: <MapPin className="h-4 w-4" />,
              content: (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="bg-white rounded-[24px] p-6 lg:p-8 shadow-iwana-soft border border-gray-100 dark:border-dark-border dark:bg-dark-surface-2">
                    <CoverageChecksPanel expedienteId={expediente.id} />
                  </div>
                </div>
              )
            }
          ]} 
        />
      </div>
    </div>
  );
}
`

fs.writeFileSync(path, replacement);
console.log('Successfully refactored page layout');
