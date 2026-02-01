from fastapi import FastAPI
from .api import transactions, manual
import os
from dotenv import load_dotenv
from backend.app.db.schema import Base
from backend.app.core.database import engine

# Load environment variables from .gemini/.env file
load_dotenv(dotenv_path=os.path.join(os.getcwd(), '.gemini', '.env'))

app = FastAPI()

@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)

app.include_router(transactions.router)
app.include_router(manual.router)

@app.get("/")
def read_root():
    return {"Hello": "World"}