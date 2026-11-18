const icons = {
  brand: '<rect x="3" y="5" width="11" height="14" rx="3"/><path d="M10 11l2 2 5-5M17 5h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-1"/>',
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  daily: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18m-12 5 2 2 4-4"/>',
  weekly: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18M8 15h1m3 0h1m3 0h1"/>',
  monthly: '<path d="M4 20h16M6 16v-4m6 4V7m6 9V4"/>',
  tasks: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 4V3h6v1M8 10h8m-8 5h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-4-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  history: '<path d="M3 12a9 9 0 1 1 2.7 6.4M3 5v7h7m2-5v5l3 2"/>',
  edit: '<path d="m14 5 5 5M4 20l4.5-1 12-12a2 2 0 0 0-4-4l-12 12z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9m-9 4h4"/>',
  arrow: '<path d="M6 12h12m-5-5 5 5-5 5"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

const sections = {
  daily: ['Journalier', 'Vue journalière'],
  weekly: ['Hebdomadaire', 'Vue hebdomadaire'],
  monthly: ['Mensuel', 'Vue mensuelle'],
  tasks: ['Mes tâches', 'Mes tâches'],
};
const frequencies = {daily: 'Journalière', weekly: 'Hebdomadaire', monthly: 'Mensuelle'};
const people = {kenzo: 'Kenzo', albane: 'Albane', both: 'Les deux'};
const view = document.querySelector('#view');
const dialog = document.querySelector('#dialog');
const nav = document.querySelector('#nav');
const toast = document.querySelector('#toast');
const monthInput = document.createElement('input');
monthInput.type = 'month';
let page, day, data, requestId = 0, toastTimer;

const format = (options, value) => new Intl.DateTimeFormat('fr-FR', options).format(value);
const titleCase = value => value.charAt(0).toLocaleUpperCase('fr-FR') + value.slice(1);
const dateKey = value => [String(value.getFullYear()).padStart(4, '0'), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
const dateFrom = value => new Date(`${value}T12:00:00`);
const shiftDay = (value, delta) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + delta, 12);
const weekStart = value => shiftDay(value, -((value.getDay() + 6) % 7));
const monthStart = value => new Date(value.getFullYear(), value.getMonth(), 1, 12);
const formatDay = value => format({weekday: 'long', day: 'numeric', month: 'long'}, value);
const formatMonth = value => format({month: 'long', year: 'numeric'}, value);
const shortDate = value => format({day: 'numeric', month: 'short'}, value);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && value >= '0100-01-01' && value <= '9998-12-31' && dateKey(dateFrom(value)) === value;
const sumMinutes = rows => rows.reduce((total, row) => total + row.minutes, 0);
const percentOf = (part, total) => total ? Math.round(part * 100 / total) : 0;
const plural = (count, singular, pluralForm = `${singular}s`) => count === 1 ? singular : pluralForm;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} h ${String(remainder).padStart(2, '0')}` : `${hours} h`;
}

function href(target, value = day) {
  return `?vue=${target}&date=${dateKey(value)}`;
}

function periodKey(value, frequency) {
  if (frequency === 'weekly') return dateKey(weekStart(value));
  if (frequency === 'monthly') return dateKey(monthStart(value));
  return dateKey(value);
}

function records(frequency, value = day) {
  const period = periodKey(value, frequency);
  return data.completions.filter(item => item.frequency === frequency && item.period === period);
}

function periodTasks(frequency, completions) {
  const active = data.tasks.filter(task => task.frequency === frequency);
  const activeIds = new Set(active.map(task => task.id));
  return [...active, ...completions.filter(item => !activeIds.has(item.task_id)).map(item => ({...item, id: item.task_id}))];
}

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, {
    method,
    ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Une erreur est survenue.');
  return result;
}

function route() {
  const params = new URLSearchParams(location.search);
  const target = params.get('vue');
  const selected = params.get('date');
  page = Object.hasOwn(sections, target) ? target : 'daily';
  day = validDate(selected) ? dateFrom(selected) : new Date();
  nav.innerHTML = Object.entries(sections).map(([key, [label]]) => `
    <a data-route href="${href(key)}" ${key === page ? 'aria-current="page"' : ''} class="nav-link ${key === 'tasks' ? 'management-link' : ''}">
      ${icon(key)}<span>${label}</span>
    </a>`).join('');
  document.querySelector('#breadcrumb').textContent = sections[page][0];
  document.title = `${sections[page][0]} · À deux`;
  refresh();
}

async function refresh() {
  const id = ++requestId;
  view.setAttribute('aria-busy', 'true');
  try {
    const result = await api(`state?date=${dateKey(day)}`);
    if (id !== requestId) return;
    data = result;
    render();
  } catch (error) {
    if (id === requestId) view.innerHTML = `<section class="panel empty"><strong>Impossible de charger les tâches.</strong><button class="button secondary" data-action="retry">Réessayer</button></section>`;
  } finally {
    if (id === requestId) view.setAttribute('aria-busy', 'false');
  }
}

function navigate(target) {
  const previousPage = page;
  history.pushState(null, '', target);
  route();
  if (page !== previousPage) window.scrollTo(0, 0);
}

function heading(description) {
  const labels = {daily: 'Aujourd’hui', weekly: 'Cette semaine', monthly: 'Ce mois-ci'};
  const now = new Date();
  const current = page !== 'tasks' && periodKey(now, page) === periodKey(day, page);
  const start = weekStart(day), end = shiftDay(start, 6);
  const yearRange = start.getFullYear() === end.getFullYear() ? '' : ` ${start.getFullYear()}`;
  const useMonth = page === 'monthly' && monthInput.type === 'month';
  const dateLabel = page === 'monthly' ? formatMonth(day) : page === 'weekly'
    ? `${shortDate(start)}${yearRange} – ${shortDate(end)} ${end.getFullYear()}`
    : formatDay(day);
  const navigation = page === 'tasks' ? '' : `
    <div class="date-controls">
      <a class="button secondary today ${current ? 'current' : ''}" data-route href="${href(page, now)}">${labels[page]}</a>
      <div class="date-group">
        <button class="icon-button" data-action="back" aria-label="Période précédente">${icon('left')}</button>
        <label class="date-picker">${icon('calendar')} <span>${titleCase(dateLabel)}</span>
          <input type="${useMonth ? 'month' : 'date'}" id="date-picker" aria-label="Choisir une date" min="${useMonth ? '0100-01' : '0100-01-01'}" max="${useMonth ? '9998-12' : '9998-12-31'}" value="${useMonth ? dateKey(day).slice(0, 7) : dateKey(day)}">
        </label>
        <button class="icon-button" data-action="forward" aria-label="Période suivante">${icon('right')}</button>
      </div>
    </div>`;
  return `<div class="page-heading"><div><h1>${sections[page][1]}</h1><p>${description}</p></div>${navigation}</div>`;
}

function avatar(who) {
  if (who === 'both') return `<span class="avatar-stack" aria-hidden="true">${avatar('kenzo')}${avatar('albane')}</span>`;
  return `<span class="avatar ${who}" aria-hidden="true">${people[who][0]}</span>`;
}

function personTag(who) {
  return `<span class="person-tag">${avatar(who)}${people[who]}</span>`;
}

function taskList(frequency, completions, {includeDate = false} = {}) {
  const byId = new Map(completions.map(item => [item.task_id, item]));
  const tasks = periodTasks(frequency, completions);
  if (!tasks.length) return '<p class="empty-note">Aucune tâche pour cette période.</p>';
  tasks.sort((a, b) => Number(byId.has(a.id)) - Number(byId.has(b.id)));
  return `<ul class="task-list">${tasks.map(task => {
    const done = byId.get(task.id);
    const name = escape(done?.name ?? task.name);
    return `<li class="task-row ${done ? 'done' : ''}">
      <button class="task-check" data-action="complete" data-id="${task.id}" aria-label="${done ? 'Modifier la réalisation de' : 'Valider'} ${name}">${done ? icon('check') : ''}</button>
      <div class="task-text"><strong>${name}</strong><small>${icon('clock')} ${duration(done?.minutes ?? task.minutes)}${done && includeDate ? `<span class="meta-dot"></span>${shortDate(dateFrom(done.day))}` : ''}</small></div>
      ${done ? `<button class="person-button" data-action="complete" data-id="${task.id}" aria-label="Modifier la réalisation de ${name}">${personTag(done.who)}</button>`
        : `<button class="validate" data-action="complete" data-id="${task.id}" aria-label="Valider ${name}">${icon('check')}<span>Valider</span></button>`}
    </li>`;
  }).join('')}</ul>`;
}

function taskPanel(frequency, completions, title, includeDate = false) {
  const total = periodTasks(frequency, completions).length;
  return `<section class="panel tasks-panel">
    <header class="panel-heading"><span class="section-icon">${icon(frequency)}</span><div><h2>${title}</h2><p>${total - completions.length} ${plural(total - completions.length, 'tâche restante', 'tâches restantes')}</p></div><span class="count">${completions.length} / ${total}</span></header>
    ${taskList(frequency, completions, {includeDate})}
  </section>`;
}

function minutesByPerson(completions) {
  const totals = {kenzo: 0, albane: 0};
  for (const {who, minutes} of completions) {
    if (who === 'both') {
      totals.kenzo += minutes / 2;
      totals.albane += minutes / 2;
    } else {
      totals[who] += minutes;
    }
  }
  return totals;
}

function distribution(completions, subtitle, dailyEstimate) {
  const totals = minutesByPerson(completions);
  const total = sumMinutes(completions);
  const kenzoShare = percentOf(totals.kenzo, total);
  const share = {kenzo: kenzoShare, albane: total ? 100 - kenzoShare : 0};
  const dailyTotals = dailyEstimate ? minutesByPerson(dailyEstimate.completions) : null;
  return `<section class="panel distribution">
    <header class="panel-heading"><span class="section-icon peach">${icon('people')}</span><div><h2>Répartition</h2><p>${subtitle}</p></div></header>
    <div class="distribution-body">${['kenzo', 'albane'].map(who => `
      <div class="distribution-person">${avatar(who)}<strong>${people[who]}</strong><span>${duration(Math.floor(totals[who]))}${totals[who] % 1 ? ' 30 s' : ''}</span></div>
      <div class="track"><span class="${who}" style="width:${share[who]}%"></span></div>`).join('')}</div>
    ${dailyTotals ? `<div class="distribution-estimate">
      <h3>Part du temps total estimé des tâches journalières</h3>
      <dl>${Object.entries(dailyTotals).map(([who, minutes]) => `
        <div><dt>${people[who]}</dt><dd class="${who}">${percentOf(minutes, dailyEstimate.totalMinutes)} %</dd></div>`).join('')}</dl>
    </div>` : ''}
  </section>`;
}

function activity(completions) {
  return `<section class="panel activity">
    <header class="panel-heading"><span class="section-icon mint">${icon('history')}</span><div><h2>Activité du jour</h2><p>Les tâches réalisées à cette date</p></div></header>
    ${completions.length ? `<ul class="activity-list">${completions.map(item => `<li>${avatar(item.who)}<div><strong>${escape(item.name)}</strong><small>${people[item.who]} · ${duration(item.minutes)}</small></div></li>`).join('')}</ul>`
      : `<div class="activity-empty"><span class="empty-icon">${icon('check')}</span><p>Aucune tâche validée pour le moment.</p></div>`}
  </section>`;
}

function renderDaily() {
  const daily = records('daily');
  const tasks = periodTasks('daily', daily);
  const doneIds = new Set(daily.map(item => item.task_id));
  const remaining = tasks.filter(task => !doneIds.has(task.id));
  const total = tasks.length;
  const remainingMinutes = sumMinutes(remaining);
  const completedMinutes = sumMinutes(daily);
  const totalMinutes = completedMinutes + remainingMinutes;
  const timeProgress = percentOf(completedMinutes, totalMinutes);
  const today = dateKey(day) === dateKey(new Date());
  const allDone = data.completions.filter(item => item.day === dateKey(day));
  return `${heading('Visualisez les tâches et indiquez qui les a réalisées.')}
    <section class="hero">
      <div class="hero-content"><div class="hero-label">${icon('calendar')} ${titleCase(formatDay(day))}</div>
      <h2>${today ? 'Les tâches du jour' : 'Les tâches de la journée'}</h2>
      <p>${remaining.length ? `${remaining.length} ${plural(remaining.length, 'tâche à faire', 'tâches à faire')}` : total ? 'Toutes les tâches journalières sont terminées.' : 'Aucune tâche journalière prévue.'}</p>
      <dl class="hero-times">
        <div><dt>Temps total estimé</dt><dd>${duration(totalMinutes)}</dd></div>
        <div><dt>Temps restant estimé</dt><dd>${duration(remainingMinutes)}</dd></div>
      </dl>
      <div class="hero-progress">
        <div><span>Temps estimé réalisé</span><strong>${duration(completedMinutes)} sur ${duration(totalMinutes)} · ${timeProgress} %</strong></div>
        <div class="track" role="progressbar" aria-label="Part du temps total estimé réalisée" aria-valuenow="${timeProgress}" aria-valuetext="${timeProgress} %, ${duration(completedMinutes)} sur ${duration(totalMinutes)}"><span style="width:${timeProgress}%"></span></div>
      </div></div>
      <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-sheet"><div class="art-tab"></div><div>${icon('check')}<i></i></div><div>${icon('check')}<i></i></div><div><b></b><i></i></div></div><span class="art-tick">${icon('check')}</span><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✧</span><span class="art-dot"></span></div>
    </section>
    <div class="columns"><div class="column">
      ${taskPanel('daily', daily, 'Tâches journalières')}
      ${taskPanel('weekly', records('weekly'), 'Tâches de la semaine', true)}
    </div><div class="column">${distribution(allDone, 'Temps des tâches réalisées ce jour', {completions: daily, totalMinutes})}${activity(allDone)}</div></div>`;
}

function renderWeekly() {
  const start = weekStart(day);
  const days = Array.from({length: 7}, (_, index) => shiftDay(start, index));
  const weekly = records('weekly');
  const dailyCount = days.reduce((total, value) => total + records('daily', value).length, 0);
  const weekDone = data.completions.filter(item => item.day >= dateKey(start) && item.day <= dateKey(days[6]));
  return `${heading('Suivez la semaine du lundi au dimanche et ouvrez le détail de chaque jour.')}
    <section class="panel week-panel"><header class="panel-heading"><span class="section-icon">${icon('weekly')}</span><div><h2>Tâches journalières</h2><p>${dailyCount} ${plural(dailyCount, 'réalisation', 'réalisations')} cette semaine</p></div></header>
    <div class="week-days">${days.map(value => {
      const done = records('daily', value);
      const byId = new Map(done.map(item => [item.task_id, item]));
      const tasks = periodTasks('daily', done);
      return `<article class="week-day ${dateKey(value) === dateKey(new Date()) ? 'is-today' : ''}">
        <a data-route href="${href('daily', value)}"><span>${titleCase(format({weekday: 'long'}, value))}</span><strong>${value.getDate()} ${format({month: 'short'}, value)}</strong>${icon('arrow')}</a>
        <div class="week-progress"><span>${done.length} / ${tasks.length}</span><div class="track"><span style="width:${tasks.length ? done.length * 100 / tasks.length : 0}%"></span></div></div>
        <ul>${tasks.map(task => {
          const item = byId.get(task.id);
          return `<li><span class="week-check ${item ? 'checked' : ''}" aria-label="${item ? people[item.who] : 'À faire'}">${item ? icon('check') : ''}</span><span>${escape(item?.name ?? task.name)}</span></li>`;
        }).join('')}</ul>
      </article>`;
    }).join('')}</div></section>
    <div class="columns"><div class="column">${taskPanel('weekly', weekly, 'Tâches hebdomadaires', true)}</div><div class="column">${distribution(weekDone, 'Temps des tâches réalisées cette semaine')}</div></div>`;
}

function renderMonthly() {
  const prefix = dateKey(day).slice(0, 7);
  const completions = data.completions.filter(item => item.day.startsWith(prefix));
  const daily = completions.filter(item => item.frequency === 'daily').length;
  const weekly = completions.filter(item => item.frequency === 'weekly').length;
  const monthly = records('monthly');
  const total = completions.length;
  const stats = [['daily', daily, 'Tâches journalières'], ['weekly', weekly, 'Tâches hebdomadaires'],
    ['monthly', monthly.length, 'Tâches mensuelles'], ['clock', duration(sumMinutes(completions)), 'Temps total estimé']];
  return `${heading('Consultez le bilan du mois et validez les tâches mensuelles.')}
    <div class="stats">${stats.map(([symbol, value, label]) => `<div class="panel stat"><span class="section-icon">${icon(symbol)}</span><div><strong>${value}</strong><span>${label}</span></div></div>`).join('')}</div>
    <div class="columns"><div class="column">
      ${taskPanel('monthly', monthly, 'Tâches mensuelles', true)}
      <section class="panel"><header class="panel-heading"><span class="section-icon mint">${icon('history')}</span><div><h2>Historique du mois</h2><p>${total} ${plural(total, 'réalisation', 'réalisations')}</p></div></header>
      ${total ? `<ul class="activity-list month-history">${completions.map(item => `<li><span class="history-date">${shortDate(dateFrom(item.day))}</span><div><strong>${escape(item.name)}</strong><small>${frequencies[item.frequency]} · ${duration(item.minutes)}</small></div>${personTag(item.who)}</li>`).join('')}</ul>` : '<p class="empty-note">Aucune tâche réalisée ce mois-ci.</p>'}</section>
    </div><div class="column">${distribution(completions, 'Temps des tâches réalisées ce mois-ci')}</div></div>`;
}

function renderTasks() {
  return `${heading('Gérez les listes récurrentes et la durée estimée de chaque tâche.')}
    <div class="catalog">${Object.entries(frequencies).map(([frequency, label]) => {
      const tasks = data.tasks.filter(task => task.frequency === frequency);
      return `<section class="panel"><header class="panel-heading"><span class="section-icon">${icon(frequency)}</span><div><h2>${label}</h2><p>${tasks.length} ${plural(tasks.length, 'tâche')}</p></div><button class="icon-button panel-action" data-action="add" data-frequency="${frequency}" aria-label="Ajouter une tâche ${label.toLowerCase()}">${icon('plus')}</button></header>
      ${tasks.length ? `<ul class="task-list">${tasks.map(task => `<li class="task-row"><div class="task-text"><strong>${escape(task.name)}</strong><small>${icon('clock')} ${duration(task.minutes)}</small></div><button class="icon-button" data-action="edit" data-id="${task.id}" aria-label="Modifier ${escape(task.name)}">${icon('edit')}</button></li>`).join('')}</ul>` : '<p class="empty-note">Aucune tâche dans cette liste.</p>'}</section>`;
    }).join('')}</div>`;
}

function render() {
  view.innerHTML = {daily: renderDaily, weekly: renderWeekly, monthly: renderMonthly, tasks: renderTasks}[page]();
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function modal(title, description, fields, actions, onSubmit, onAction) {
  dialog.innerHTML = `<form class="dialog-form"><header><div><h2 id="dialog-title">${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-dialog="close" aria-label="Fermer">${icon('close')}</button></header>
    <div class="dialog-fields">${fields}<p class="form-error" role="alert" hidden></p></div>
    <footer>${actions}<button type="button" class="button secondary" data-dialog="close">Annuler</button><button class="button primary" type="submit">Enregistrer</button></footer></form>`;
  const form = dialog.querySelector('form');
  const errorBox = form.querySelector('.form-error');
  let saving = false;
  const handle = async action => {
    if (saving) return;
    saving = true;
    errorBox.hidden = true;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const message = await action();
      if (message) {
        dialog.close();
        await refresh();
        notify(message);
      }
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      saving = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = new FormData(form);
    handle(() => onSubmit(fields));
  });
  form.addEventListener('click', event => {
    const action = event.target.closest('[data-dialog]')?.dataset.dialog;
    if (action === 'close') dialog.close();
    else if (action) handle(() => onAction(action));
  });
  dialog.oncancel = event => { if (saving) event.preventDefault(); };
  dialog.showModal();
}

function taskEditor(task, frequency = 'daily') {
  modal(task ? 'Modifier la tâche' : 'Nouvelle tâche', 'Une tâche se répète selon la fréquence choisie.',
    `<label>Nom de la tâche<input name="name" maxlength="100" placeholder="Ex. Trier les affaires" value="${escape(task?.name ?? '')}" required autofocus></label>
     <div class="form-columns">
       <label>Fréquence<select name="frequency" ${task ? 'disabled' : ''}>${Object.entries(frequencies).map(([key, label]) => `<option value="${key}" ${key === (task?.frequency ?? frequency) ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
       <label>Durée estimée (min)<input name="minutes" type="number" min="1" max="1440" step="1" placeholder="15" value="${task?.minutes ?? ''}" required></label>
     </div>`,
    task ? `<button type="button" class="button danger" data-dialog="archive">${icon('archive')} Archiver</button>` : '',
    async fields => {
      await api(task ? `tasks/${task.id}` : 'tasks', task ? 'PUT' : 'POST', {
        name: fields.get('name'), frequency: fields.get('frequency'), minutes: Number(fields.get('minutes')),
      });
      return task ? 'Tâche modifiée.' : 'Tâche créée.';
    },
    async () => {
      if (!window.confirm('Archiver cette tâche ? Ses réalisations resteront dans l’historique.')) return;
      await api(`tasks/${task.id}`, 'DELETE');
      return 'Tâche archivée.';
    });
}

function completionEditor(id) {
  const task = data.tasks.find(item => item.id === id);
  const done = data.completions.find(item => item.task_id === id && item.period === periodKey(day, item.frequency));
  const details = done || task;
  if (!details) return;
  const frequency = details.frequency;
  const start = periodKey(day, frequency);
  const end = frequency === 'weekly' ? dateKey(shiftDay(weekStart(day), 6)) : frequency === 'monthly'
    ? dateKey(new Date(day.getFullYear(), day.getMonth() + 1, 0, 12)) : start;
  const completionDay = done?.day ?? dateKey(day);
  modal(done ? 'Modifier la réalisation' : 'Valider la tâche', `${escape(details.name)} · ${duration(details.minutes)}`,
    `<fieldset><legend>Qui a réalisé la tâche ?</legend><div class="person-options">
      ${Object.entries(people).map(([who, label]) => `<label class="person-option"><input type="radio" name="who" value="${who}" ${done?.who === who ? 'checked' : ''} required><span>${avatar(who)}${label}</span></label>`).join('')}
    </div></fieldset>
    ${frequency !== 'daily' ? `<label>Date de réalisation<input name="day" type="date" min="${start}" max="${end}" value="${completionDay}" required></label>` : ''}`,
    done ? '<button type="button" class="button danger" data-dialog="undo">Annuler la validation</button>' : '',
    async fields => {
      await api('completions', 'PUT', {taskId: id, day: fields.get('day') ?? completionDay, who: fields.get('who')});
      return done ? 'Réalisation modifiée.' : 'Tâche validée.';
    },
    async () => {
      await api('completions', 'DELETE', {taskId: id, day: completionDay});
      return 'Validation annulée.';
    });
}

function movePeriod(delta) {
  const next = page === 'monthly' ? new Date(day.getFullYear(), day.getMonth() + delta, 1, 12)
    : shiftDay(day, delta * (page === 'weekly' ? 7 : 1));
  if (validDate(dateKey(next))) navigate(href(page, next));
}

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
document.querySelector('#add-task').addEventListener('click', () => taskEditor(null, page === 'tasks' ? 'daily' : page));
document.addEventListener('click', event => {
  const link = event.target.closest('[data-route]');
  if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(link.getAttribute('href'));
  }
  const control = event.target.closest('[data-action]');
  if (!control || view.getAttribute('aria-busy') === 'true') return;
  const id = Number(control.dataset.id);
  switch (control.dataset.action) {
    case 'back': movePeriod(-1); break;
    case 'forward': movePeriod(1); break;
    case 'add': taskEditor(null, control.dataset.frequency); break;
    case 'edit': taskEditor(data.tasks.find(task => task.id === id)); break;
    case 'complete': completionEditor(id); break;
    case 'retry': refresh(); break;
  }
});
view.addEventListener('change', event => {
  if (event.target.id !== 'date-picker') return;
  const value = page === 'monthly' && event.target.value.length === 7 ? `${event.target.value}-01` : event.target.value;
  if (validDate(value)) navigate(href(page, dateFrom(value)));
});
window.addEventListener('popstate', route);
route();
