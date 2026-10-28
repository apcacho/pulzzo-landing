/* Reusable, transport-free invitation renderer. No persistence or delivery side effects. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PulzzoCRMInvitationEmail = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function cleanText(value) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  }
  function urls(entryUrl, trustedBaseUrl) {
    if (typeof trustedBaseUrl !== 'string' || typeof entryUrl !== 'string' || !entryUrl || /[\s\\\u0000-\u001f\u007f]/.test(entryUrl)) {
      throw new Error('El enlace de registro no es válido.');
    }
    var base, entry, expected, logo;
    try {
      base = new URL(trustedBaseUrl);
      expected = new URL('asistido-demo.html', base);
      entry = new URL(entryUrl, base);
      logo = new URL('assets/images/logo-pulzzo.png', base);
    } catch (_) { throw new Error('El enlace de registro no es válido.'); }
    if (!/^https?:$/.test(base.protocol) || base.username || base.password ||
        entry.origin !== base.origin || entry.protocol !== base.protocol || entry.username || entry.password ||
        entry.pathname !== expected.pathname || entry.search || !/^#entry=[A-Za-z0-9_-]{1,512}$/.test(entry.hash) ||
        /[?%]/.test(entryUrl) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(entryUrl)) {
      throw new Error('Usa únicamente el enlace personal de registro de este sitio.');
    }
    return {entry:entry.href, logo:logo.href};
  }
  /**
   * Caller supplies the configured application base URL (or current page URL),
   * an active stable entry URL, and facts from the actual saved expediente.
   * Missing progress facts are false; no persisted-document claim is inferred.
   * Rendering is also safe without a recipient or assigned owner. Future sending
   * must be explicitly implemented and configured outside this pure module.
   */
  function render(input) {
    input = input || {};
    if (input.kind !== 'patient' && input.kind !== 'doctor') throw new Error('Tipo de registro no válido.');
    var links = urls(input.entryUrl, input.trustedBaseUrl);
    var progress = input.progress || {};
    var savedInformation = progress.hasSavedInformation === true;
    var savedDocuments = progress.hasSavedDocuments === true;
    var started = progress.hasStarted === true || savedInformation || savedDocuments;
    var patient = input.kind === 'patient';
    var name = cleanText(input.name), owner = cleanText(input.ownerDisplayName);
    var subject = patient ? 'Continúa tu solicitud en PULZZO' : 'Continúa tu registro profesional en PULZZO';
    var eyebrow = patient ? 'CONTINÚA TU SOLICITUD' : 'CONTINÚA TU REGISTRO PROFESIONAL';
    var heading = started ? 'Retoma tu registro' : 'Comienza tu registro';
    var greeting = name ? 'Hola, ' + name + ':' : 'Hola:';
    var intro = 'Tu registro en PULZZO está listo para ' + (started ? 'continuar.' : 'comenzar.');
    var saved = savedDocuments ? (savedInformation ? 'Tu información y documentos están guardados.' : 'Tus documentos están guardados.') :
      (savedInformation ? 'Tu información está guardada.' : '');
    if (saved && started) saved += ' No necesitas empezar de nuevo.';
    var instructions = patient ? 'Revisa tus datos, completa lo que falte y realiza personalmente la carga de tu INE, selfie y autorizaciones.' :
      'Revisa los datos de tu perfil profesional y completa la información y los documentos que se soliciten en tu registro.';
    var help = owner ? owner + ', tu responsable de seguimiento, puede acompañarte durante el proceso.' :
      'Si necesitas acompañamiento, contacta al equipo PULZZO por tu canal habitual.';
    var cta = 'Continuar mi registro';
    var fallback = 'Si el botón no funciona, copia y pega tu enlace personal en el navegador:';
    var disclaimer = 'Si no reconoces este registro, ignora este correo.';
    var accent = patient ? '#20C7D4' : '#FF8A5B';
    var tint = patient ? '#EAF9FA' : '#FFF1E9';
    var e = escapeHtml;
    var text = [eyebrow, heading, greeting, intro, saved, instructions, cta + ':\n' + links.entry,
      '¿Necesitas ayuda?\n' + help, fallback + '\n' + links.entry, 'Equipo PULZZO.', disclaimer].filter(Boolean).join('\n\n');
    var html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; img-src ' + e(links.logo) + '; style-src &apos;unsafe-inline&apos;; base-uri &apos;none&apos;; form-action &apos;none&apos;"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(subject) + '</title></head>' +
      '<body style="margin:0;padding:0;background-color:#f5f8fb;color:#0b1730;font-family:Arial,Helvetica,sans-serif;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f5f8fb;"><tr><td align="center" style="padding:28px 12px;">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #dce4ec;border-radius:8px;background-color:#ffffff;">' +
      '<tr><td bgcolor="#081830" style="padding:24px 28px;background-color:#081830;border-radius:8px 8px 0 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="48" style="width:48px;vertical-align:middle;"><img src="' + e(links.logo) + '" width="48" height="50" alt="" style="display:block;width:48px;height:50px;border:0;"></td>' +
      '<td style="padding-left:9px;vertical-align:middle;color:#ffffff;font-size:36px;line-height:44px;font-weight:700;letter-spacing:-1px;">pulzzo</td></tr></table></td></tr>' +
      '<tr><td style="padding:30px 28px 28px;">' +
      '<p style="margin:0 0 16px;color:#465973;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;">' + eyebrow + '</p>' +
      '<h1 style="margin:0 0 26px;color:#0b1730;font-size:32px;line-height:38px;font-weight:700;">' + heading + '</h1>' +
      '<p style="margin:0 0 18px;font-size:18px;line-height:27px;">' + e(greeting) + '</p>' +
      '<p style="margin:0 0 20px;color:#465973;font-size:16px;line-height:25px;">' + intro + '</p>' +
      (saved ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:22px;background-color:' + tint + ';border-radius:8px;"><tr><td width="32" style="width:32px;padding:18px 0 18px 16px;vertical-align:top;color:#0b1730;font-size:24px;line-height:28px;">✓</td><td style="padding:18px 16px 18px 12px;font-size:16px;line-height:24px;font-weight:600;">' + e(saved) + '</td></tr></table>' : '') +
      '<p style="margin:0 0 28px;color:#465973;font-size:16px;line-height:25px;">' + instructions + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 34px;"><tr><td bgcolor="' + accent + '" style="background-color:' + accent + ';border-radius:6px;text-align:center;mso-padding-alt:16px 26px;"><a href="' + e(links.entry) + '" style="display:inline-block;padding:16px 26px;border-radius:6px;color:#071830;font-size:17px;line-height:23px;font-weight:700;text-decoration:none;">' + cta + ' &#8594;</a></td></tr></table>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #dce4ec;"><tr><td style="padding-top:26px;">' +
      '<h2 style="margin:0 0 7px;font-size:18px;line-height:26px;">¿Necesitas ayuda?</h2>' +
      '<p style="margin:0 0 22px;color:#465973;font-size:15px;line-height:24px;">' + e(help) + '</p>' +
      '<p style="margin:0 0 7px;color:#465973;font-size:13px;line-height:21px;">' + fallback + '</p>' +
      '<p style="margin:0 0 28px;font-size:13px;line-height:21px;word-break:break-all;overflow-wrap:anywhere;"><a href="' + e(links.entry) + '" style="color:#075977;text-decoration:underline;word-break:break-all;">' + e(links.entry) + '</a></p>' +
      '<p style="margin:0;font-size:15px;line-height:23px;">Equipo PULZZO.</p></td></tr></table></td></tr></table>' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td align="center" style="padding:16px 12px 0;color:#7b889f;font-size:12px;line-height:19px;">' + disclaimer + '</td></tr></table>' +
      '</td></tr></table></body></html>';
    return {subject:subject, html:html, text:text, entryUrl:links.entry,
      variant:input.kind + '-' + (savedDocuments ? 'started-documents' : started ? 'started' : 'new')};
  }
  return {render:render};
}));
