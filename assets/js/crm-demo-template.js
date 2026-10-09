/* Native CRM surface. Shared IDs are scoped inside the Backoffice ShadowRoot. */
(function (root) {
  'use strict';
  root.PulzzoCRMTemplate = `<div class="crm-toolbar">
  <div class="crm-contexts" role="group" aria-label="Contexto del CRM">
      <button type="button" class="context-link active" data-context-switch="patient" aria-pressed="true"><span class="nav-dot patient"></span>Clientes <span class="context-count" id="patientCount">0</span></button>
      <button type="button" class="context-link" data-context-switch="doctor" aria-pressed="false"><span class="nav-dot doctor"></span>Proveedores <span class="context-count" id="doctorCount">0</span></button>
  </div>
  <div class="crm-toolbar-actions">
    <button class="quiet" id="identityReviewButton" type="button" data-action="identity-review" hidden>Revisar identidad</button>
    <button class="quiet" id="phoneSettings" type="button">MyPhone</button>
    <button class="quiet" id="loadExamples" type="button">Cargar ejemplos ficticios</button>
    <button class="primary" id="newContact" type="button">＋ Nuevo prospecto</button>
  </div>
  <label class="actor-label">Simulación CRM <select id="actorSelect" aria-describedby="demoWarning"><option value="kam_ana">Ana · KAM demo</option><option value="kam_luis">Luis · KAM demo</option><option value="admin_demo">Administración demo</option></select></label>
</div>
<div class="demo-warning" id="demoWarning"><strong>Solo datos ficticios.</strong> Almacenamiento local sin seguridad ni autenticación real. No agregues información sensible, credenciales ni documentos reales. Cambiar de usuario simula un rol. No se envían correos.</div>
<div class="crm-content">
      <div class="workspace-bar"><nav class="tabs" aria-label="Vista del CRM"><button type="button" class="tab active" data-view="contacts" aria-pressed="true">Contactos</button><button type="button" class="tab" data-view="tasks" aria-pressed="false">Tareas</button><button type="button" class="tab" data-view="dashboard" aria-pressed="false">Dashboard</button></nav><span class="storage-label" id="storageLabel">Guardado en este navegador</span></div>
      <p class="notice" id="notice" role="status" aria-live="polite" hidden></p>
      <section id="contactsView" aria-label="Contactos">
        <div class="panel contact-controls"><div class="directory-filters"><label class="search-label">Buscar prospecto<input id="contactSearch" type="search" placeholder="Nombre, correo o teléfono" maxlength="160"></label><div class="filter-row"><label>Etapa<select id="stageFilter"><option value="">Todas las etapas</option></select></label><label>Responsable<select id="ownerFilter"><option value="">Todos los accesibles</option><option value="kam_ana">Ana</option><option value="kam_luis">Luis</option></select></label></div></div><div class="attention-controls"><div class="attention-filter-row"><label>Atención<select id="attentionFilter"><option value="">Todo el seguimiento</option><option value="no_task">Sin próxima tarea</option><option value="no_contact">Sin contacto registrado</option><option value="inactive">Inactividad con corte elegido</option></select></label><label id="lifecycleFilterField" hidden>Estado de la ficha<select id="lifecycleFilter"><option value="active">Activos</option><option value="archived">Archivados</option></select></label></div><div id="inactivityControls" class="inactivity-controls" hidden><label>Definir corte por<select id="inactivityMode"><option value="days">Días elegidos</option><option value="date">Fecha elegida</option></select></label><label id="inactivityDaysField">Días sin intento de contacto<input id="inactivityDays" type="number" min="1" max="36500" step="1" placeholder="Elegir días"></label><label id="inactivityDateField" hidden>Último intento anterior al<input id="inactivityDate" type="date"></label></div><p id="attentionSummary" class="help" aria-live="polite"></p></div><div class="contact-view-bar"><span>Seguimiento comercial</span><div class="view-toggle" role="group" aria-label="Presentación de contactos"><button type="button" data-contact-layout="list" aria-pressed="true">Lista</button><button type="button" data-contact-layout="kanban" aria-pressed="false">Kanban</button></div></div></div>
        <div id="commercialBoard" class="commercial-board" role="region" aria-label="Tablero de etapas comerciales" hidden></div><p id="boardAnnouncement" class="sr-only" role="status" aria-live="polite"></p>
        <div id="contactWorkspace" class="contact-workspace">
          <section id="contactDirectory" class="panel directory" aria-label="Directorio de prospectos">
            <div class="directory-summary"><span id="contactCount">0 contactos</span><span>Etapa comercial</span></div>
            <div id="contactList" class="contact-list"></div>
          </section>
          <section id="contactDetail" class="panel contact-detail" tabindex="-1" aria-label="Ficha del contacto"><div class="contact-empty"><div class="contact-empty-copy"><h2>Empieza con un prospecto</h2><p>Crea una ficha o explora el CRM con datos ficticios.</p></div></div></section>
        </div>
      </section>
      <section id="tasksView" hidden aria-label="Tareas y pendientes"><div class="panel"><div class="panel-heading"><div><h2>Agenda de seguimiento</h2><p>Fechas de referencia CDMX. Cerrar una tarea requiere un motivo.</p></div><button class="primary" type="button" id="newTask">＋ Nueva tarea</button></div><div id="taskBoard" class="task-board"></div></div></section>
      <section id="dashboardView" hidden aria-label="Dashboard CRM"><div class="panel"><div class="panel-heading"><div><h2>Actividad del equipo</h2><p>Eventos del período seleccionado, con filtros de contexto y responsable.</p></div><div class="period-controls"><label>Mes<select id="dashboardMonth"><option value="1">Enero</option><option value="2">Febrero</option><option value="3">Marzo</option><option value="4">Abril</option><option value="5">Mayo</option><option value="6">Junio</option><option value="7">Julio</option><option value="8">Agosto</option><option value="9">Septiembre</option><option value="10">Octubre</option><option value="11">Noviembre</option><option value="12">Diciembre</option></select></label><label>Año<input id="dashboardYear" type="number" min="2020" max="2100"></label><label>Responsable<select id="dashboardKam"><option value="">Todos los accesibles</option><option value="kam_ana">Ana</option><option value="kam_luis">Luis</option></select></label></div></div><div id="dashboardContent"></div></div></section>

</div>
  <dialog id="editorDialog" aria-labelledby="dialogTitle"><div class="dialog-heading"><h2 id="dialogTitle">Editar</h2><button class="icon-button" type="button" id="closeDialog" aria-label="Cerrar">×</button></div><div id="dialogContent"></div></dialog>
<footer class="app-footer"><span>Guardado local · El registro de contacto es manual. Gmail está separado e inactivo.</span><a class="holder-entry" href="asistido-demo.html" target="_blank" rel="noopener noreferrer">Portal del titular demo ↗</a></footer>`;
})(typeof globalThis !== 'undefined' ? globalThis : this);
