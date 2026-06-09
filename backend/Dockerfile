FROM python:3.12-slim

# Evitar que python escriba archivos .pyc y forzar buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copiar requirements y el código del backend
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/

EXPOSE 3000

# Ejecutar el servidor backend
CMD ["python", "app.py"]
