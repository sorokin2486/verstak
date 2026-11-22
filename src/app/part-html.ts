/** HTML builders for the part screen. Everything from files goes through esc(). */
import { esc } from '../core/escape.ts';
import { approxWarning, historyFor, orphanValues, type RevisionDiff } from '../core/measurements.ts';
import { legendEntries, stampRows } from '../core/sheet.ts';
import type { Drawing, LogEntry, Measurements, Param } from '../core/types.ts';

const SWATCH: Readonly<Record<string, string>> = {
  part: 'sw-part', hidden: 'sw-hidden', section: 'sw-section', center: 'sw-center', thin: 'sw-thin',
};

export function unitFor(drawing: Drawing, p: Param): string {
  if (p.kind === 'angle') return '°';
  if (p.kind === 'count') return 'шт';
  return drawing.units;
}

export function headerHtml(d: Drawing): string {
  const steps = d.steps?.length ? `<ol class="steps">${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '';
  return `<header class="part-head">
    <div class="head-row">
      <p class="eyebrow">Чертёж под замер · ревизия ${d.revision}</p>
      <button type="button" class="ghost" data-act="open-folder">Открыть папку</button>
    </div>
    <h1>${esc(d.title)}</h1>
    ${d.intro ? `<p class="lead">${esc(d.intro)}</p>` : ''}
    ${steps}
  </header>`;
}

export function sheetHtml(d: Drawing): string {
  const views = d.views.map((v) => {
    const grow = (v.box[2] / v.box[3]).toFixed(4);
    return `<div class="view" style="flex: ${grow} 1 0"><span class="view-cap">${esc(v.title)}</span>` +
      `<div class="view-host" data-view="${esc(v.id)}"></div></div>`;
  }).join('');
  const legend = legendEntries(d).map(([st, label]) =>
    `<span><i class="sw ${SWATCH[st] ?? ''}"></i>${esc(label)}</span>`).join('');
  const stamp = stampRows(d).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('');
  return `<section class="sheet" aria-label="Чертёж">
    <div class="views">${views}</div>
    <div class="sheet-foot"><div class="legend">${legend}</div><div class="stamp" aria-label="Штамп">${stamp}</div></div>
  </section>`;
}

export function bannerHtml(d: Drawing, previous: number, diff: RevisionDiff): string {
  const list = (title: string, ids: readonly string[]) => ids.length
    ? `<li>${title}: <b>${ids.map(esc).join(', ')}</b></li>` : '';
  const items = list('новые размеры', diff.added) + list('убраны (значения сохранены ниже)', diff.removed) +
    list('изменено описание', diff.relabelled);
  return `<div class="banner" role="status">
    <div><b>Чертёж обновлён: ревизия ${previous} → ${d.revision}.</b>
    ${d.changes ? `<p>${esc(d.changes)}</p>` : ''}
    ${items ? `<ul>${items}</ul>` : ''}</div>
    <button type="button" data-act="ack">Понятно</button>
  </div>`;
}

const fmtTime = (iso: string): string => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
};

export function historyHtml(entries: readonly LogEntry[]): string {
  return [...entries].reverse().map((e) =>
    `<li><time>${esc(fmtTime(e.at))}</time> ${esc(e.from ?? '—')} → <b>${esc(e.to ?? '—')}</b></li>`).join('');
}

function rowHtml(d: Drawing, p: Param, m: Measurements, isNew: boolean): string {
  const value = m.values[p.id]?.value ?? '';
  const hist = historyFor(m, p.id);
  const warn = approxWarning(p, value);
  return `<div class="row${value ? ' filled' : ''}${p.critical ? ' crit' : ''}" id="row-${p.id}" data-k="${p.id}">
    <label class="key" for="in-${p.id}">${esc(p.id)}</label>
    <div class="desc">
      <label for="in-${p.id}">${esc(p.label)}${isNew ? ' <span class="chip new">новый</span>' : ''}${p.optional ? ' <span class="chip">необяз.</span>' : ''}</label>
      ${p.hint ? `<small class="hint">${esc(p.hint)}</small>` : ''}
      <small class="warn"${warn ? '' : ' hidden'}>${esc(warn ?? '')}</small>
      <button type="button" class="hist-btn" data-hist="${p.id}"${hist.length ? '' : ' hidden'}>история · ${hist.length}</button>
      <ol class="hist" id="hist-${p.id}" hidden>${historyHtml(hist)}</ol>
    </div>
    <span class="field"><input id="in-${p.id}" data-k="${p.id}" inputmode="decimal" placeholder="0.0" autocomplete="off" value="${esc(value)}"><span class="unit">${esc(unitFor(d, p))}</span></span>
  </div>`;
}

export function formHtml(d: Drawing, m: Measurements, added: ReadonlySet<string>): string {
  return d.groups.map((g) => {
    const rows = d.params.filter((p) => p.group === g.id).map((p) => rowHtml(d, p, m, added.has(p.id))).join('');
    if (!rows) return '';
    return `<section class="group${g.critical ? ' critical' : ''}">
      <div class="group-head"><h2>${esc(g.title)}</h2>${g.critical ? '<span class="badge">важно</span>' : ''}</div>
      ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ''}${rows}</section>`;
  }).join('');
}

export function orphansHtml(d: Drawing, m: Measurements): string {
  const orphans = orphanValues(d, m);
  if (orphans.length === 0) return '';
  const rows = orphans.map(([id, v]) =>
    `<li><b>${esc(id)}</b> = ${esc(v.value)} <small>(ревизия ${v.drawingRevision})</small></li>`).join('');
  return `<section class="group orphans"><h2>Значения из прошлых ревизий</h2>
    <p class="group-note">Этих размеров на чертеже больше нет. Значения сохранены в файле замеров.</p><ul>${rows}</ul></section>`;
}

export function commentHtml(d: Drawing, m: Measurements): string {
  return `<section class="group comment" aria-label="Комментарий и передача">
    <h2>Комментарий</h2>
    <p class="group-note">Что нарисовано неверно, что куда вставляется, принтер, сопло и материал.</p>
    <textarea id="comment" placeholder="${esc(d.commentHint ?? '')}">${esc(m.comment)}</textarea>
    <div class="actions">
      <button type="button" id="done-btn" data-act="done"></button>
      <button type="button" class="ghost" data-act="copy">Скопировать текстом</button>
      <span class="progress" id="progress"></span>
      <span class="save-state" id="save-state" role="status"></span>
    </div>
  </section>`;
}

export function errorsHtml(name: string, errors: readonly string[]): string {
  return `<section class="group error-box"><h2>Чертёж «${esc(name)}» не открывается</h2>
    <p class="group-note">Claude: проверь файл командой <code>npm run validate</code>.</p>
    <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>`;
}
