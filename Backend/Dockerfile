# Étape 1: Image de base Python
FROM python:3.11-slim

# Définir le répertoire de travail
WORKDIR /app

# Installer les dépendances système requises
RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    pkg-config \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copier le fichier requirements.txt
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier les fichiers de l'application
COPY script.py .
COPY .env* ./

# Exposer le port par défaut de FastAPI
EXPOSE 8000

# Commande pour démarrer l'application
CMD ["uvicorn", "script:app", "--host", "0.0.0.0", "--port", "8000"]
