# Backend API image. Python 3.12 has wheels for asyncpg/numpy (unlike 3.14),
# so building here sidesteps the local runtime problem.
FROM python:3.12-slim

WORKDIR /app

# install deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# copy the app code
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
