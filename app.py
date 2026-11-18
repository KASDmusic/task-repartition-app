import calendar
import json
import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import date, timedelta
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('TASK_DB', ROOT / 'data' / 'tasks.sqlite3'))
FREQUENCIES = ('daily', 'weekly', 'monthly')
PEOPLE = ('kenzo', 'albane', 'both')
LEGACY_EXAMPLES = [
    ('Faire la vaisselle', 'daily', 15),
    ('Ranger la cuisine', 'daily', 10),
    ('Sortir les poubelles', 'daily', 5),
    ('Ranger le salon', 'daily', 10),
    ('Arroser les plantes', 'daily', 5),
    ('Passer l’aspirateur', 'weekly', 30),
    ('Nettoyer la salle de bain', 'weekly', 25),
    ('Faire la lessive', 'weekly', 20),
    ('Faire les courses', 'weekly', 45),
    ('Nettoyer le réfrigérateur', 'monthly', 30),
    ('Détartrer la bouilloire', 'monthly', 15),
    ('Faire le tri dans les placards', 'monthly', 45),
]


@contextmanager
def database():
    with closing(sqlite3.connect(DB)) as connection, connection:
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys = ON')
        yield connection


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with database() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
                minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
                archived INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS completions (
                task_id INTEGER NOT NULL REFERENCES tasks (id),
                period TEXT NOT NULL,
                day TEXT NOT NULL,
                who TEXT NOT NULL CHECK (who IN ('kenzo', 'albane', 'both')),
                name TEXT NOT NULL,
                frequency TEXT NOT NULL,
                minutes INTEGER NOT NULL,
                PRIMARY KEY (task_id, period)
            );
            CREATE INDEX IF NOT EXISTS completions_day ON completions(day);
        ''')
        db.execute('BEGIN IMMEDIATE')
        if db.execute('PRAGMA user_version').fetchone()[0] == 0:
            # The original release inserted the examples at fixed IDs before allowing user tasks.
            db.executemany('''
                UPDATE tasks SET archived = 1
                WHERE id = ? AND name = ? AND frequency = ? AND minutes = ? AND archived = 0
                AND NOT EXISTS (SELECT 1 FROM completions WHERE task_id = tasks.id)
            ''', [(task_id, *task) for task_id, task in enumerate(LEGACY_EXAMPLES, start=1)])
            db.execute('PRAGMA user_version = 1')


def parse_date(value):
    if not isinstance(value, str):
        raise ValueError('Date invalide.')
    try:
        day = date.fromisoformat(value)
    except ValueError:
        raise ValueError('Date invalide.') from None
    if day.isoformat() != value or not 2 <= day.year <= 9998:
        raise ValueError('Date invalide.')
    return day


def monday(day):
    return day - timedelta(days=day.weekday())


def period_for(day, frequency):
    if frequency == 'weekly':
        return monday(day).isoformat()
    if frequency == 'monthly':
        return day.replace(day=1).isoformat()
    return day.isoformat()


def state(db, day):
    first = monday(day.replace(day=1))
    month_end = day.replace(day=calendar.monthrange(day.year, day.month)[1])
    last = monday(month_end) + timedelta(days=6)
    tasks = db.execute('SELECT id, name, frequency, minutes FROM tasks WHERE archived = 0 ORDER BY id')
    completions = db.execute('SELECT * FROM completions WHERE day BETWEEN ? AND ? ORDER BY day DESC, rowid DESC',
                             (first.isoformat(), last.isoformat()))
    return {'tasks': [dict(row) for row in tasks], 'completions': [dict(row) for row in completions]}


def task_fields(body):
    name, minutes = body.get('name'), body.get('minutes')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
        raise ValueError('Saisissez un nom de 1 à 100 caractères.')
    if type(minutes) is not int or not 1 <= minutes <= 1440:
        raise ValueError('La durée doit être comprise entre 1 et 1 440 minutes.')
    return name.strip(), minutes


class Handler(BaseHTTPRequestHandler):
    def send_content(self, status, content, mime):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status, value):
        self.send_content(status, json.dumps(value, ensure_ascii=False).encode(), 'application/json; charset=utf-8')

    def read_json(self):
        if self.headers.get_content_type() != 'application/json':
            raise ValueError('Envoyez des données JSON.')
        size = int(self.headers.get('Content-Length', 0))
        if not 0 < size <= 8192:
            raise ValueError('Taille de requête invalide.')
        value = json.loads(self.rfile.read(size))
        if not isinstance(value, dict):
            raise ValueError('Données invalides.')
        return value

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/api/health':
            with database() as db:
                db.execute('SELECT id FROM tasks LIMIT 1').fetchone()
            self.send_json(200, {'ok': True})
            return
        if url.path == '/api/state':
            try:
                day = parse_date(parse_qs(url.query).get('date', [None])[0])
                with database() as db:
                    db.execute('BEGIN')
                    result = state(db, day)
                self.send_json(200, result)
            except ValueError as error:
                self.send_json(400, {'error': str(error)})
            return
        files = {
            '/': ('index.html', 'text/html'),
            '/styles.css': ('styles.css', 'text/css'),
            '/app.js': ('app.js', 'text/javascript'),
        }
        if url.path not in files:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        filename, mime = files[url.path]
        self.send_content(200, (ROOT / 'public' / filename).read_bytes(), mime + '; charset=utf-8')

    def do_POST(self):
        self.mutate()

    def do_PUT(self):
        self.mutate()

    def do_DELETE(self):
        self.mutate()

    def mutate(self):
        parts = urlsplit(self.path).path.strip('/').split('/')
        try:
            body = self.read_json() if self.command != 'DELETE' or parts[1:] == ['completions'] else {}
            with database() as db:
                db.execute('BEGIN IMMEDIATE')
                result, status = self.apply_change(db, parts, body)
            self.send_json(status, result)
        except ValueError as error:
            self.send_json(400, {'error': str(error)})
        except LookupError as error:
            self.send_json(404, {'error': str(error)})

    def apply_change(self, db, parts, body):
        if parts == ['api', 'tasks'] and self.command == 'POST':
            name, minutes = task_fields(body)
            frequency = body.get('frequency')
            if frequency not in FREQUENCIES:
                raise ValueError('Fréquence invalide.')
            record = db.execute('INSERT INTO tasks(name, frequency, minutes) VALUES (?, ?, ?)',
                                (name, frequency, minutes))
            return {'id': record.lastrowid}, 201
        if len(parts) == 3 and parts[:2] == ['api', 'tasks'] and self.command in ('PUT', 'DELETE'):
            task_id = int(parts[2])
            if not 0 < task_id < 2**63:
                raise ValueError('Tâche invalide.')
            if self.command == 'PUT':
                name, minutes = task_fields(body)
                record = db.execute('UPDATE tasks SET name = ?, minutes = ? WHERE id = ? AND archived = 0',
                                    (name, minutes, task_id))
            else:
                record = db.execute('UPDATE tasks SET archived = 1 WHERE id = ? AND archived = 0', (task_id,))
            if record.rowcount == 0:
                raise LookupError('Cette tâche est introuvable.')
            return {'ok': True}, 200
        if parts == ['api', 'completions'] and self.command in ('PUT', 'DELETE'):
            return self.change_completion(db, body), 200
        raise LookupError('Cette adresse est introuvable.')

    def change_completion(self, db, body):
        day = parse_date(body.get('day'))
        task_id = body.get('taskId')
        if type(task_id) is not int or not 0 < task_id < 2**63:
            raise ValueError('Tâche invalide.')
        task = db.execute('SELECT * FROM tasks WHERE id = ?', (task_id,)).fetchone()
        if task is None:
            raise LookupError('Cette tâche est introuvable.')
        period = period_for(day, task['frequency'])
        if self.command == 'DELETE':
            db.execute('DELETE FROM completions WHERE task_id = ? AND period = ?', (task_id, period))
        else:
            who = body.get('who')
            if who not in PEOPLE:
                raise ValueError('Choisissez Kenzo, Albane ou les deux.')
            existing = db.execute('SELECT 1 FROM completions WHERE task_id = ? AND period = ?', (task_id, period)).fetchone()
            if task['archived'] and not existing:
                raise LookupError('Cette tâche est archivée.')
            db.execute('''
                INSERT INTO completions (task_id, period, day, who, name, frequency, minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (task_id, period) DO UPDATE SET who = excluded.who, day = excluded.day
            ''', (task_id, period, day.isoformat(), who, task['name'], task['frequency'], task['minutes']))
        return {'ok': True}


if __name__ == '__main__':
    initialize()
    address = os.environ.get('TASK_HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 8000))
    with ThreadingHTTPServer((address, port), Handler) as server:
        print(f'À deux · http://{address}:{server.server_port}', flush=True)
        server.serve_forever()
