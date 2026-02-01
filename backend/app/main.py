from fastapi import FastAPI
from .api import transactions, ai
import os
from dotenv import load_dotenv

# Load environment variables from .gemini/.env file
load_dotenv(dotenv_path=os.path.join(os.getcwd(), '.gemini', '.env'))

app = FastAPI()

app.include_router(transactions.router)
app.include_router(ai.router)

@app.get("/")
def read_root():
    return {"Hello": "World"}