import os

from dotenv import load_dotenv
from fastapi import FastAPI

from backend.app.core.database import engine
from backend.app.db.schema import Base

from .api import manual_import, transactions

# Load environment variables from .gemini/.env file
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".gemini", ".env"))

app = FastAPI()


@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)


app.include_router(transactions.router, prefix="/api/v1")
app.include_router(manual_import.router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"Hello": "World"}
