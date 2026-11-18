FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 TASK_HOST=0.0.0.0 TASK_DB=/data/tasks.sqlite3
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app app && mkdir /data && chown app:app /data
COPY app.py .
COPY public/ public/
USER app
EXPOSE 8000
CMD ["python", "app.py"]
