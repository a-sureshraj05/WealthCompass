from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from ..api.manual_parser import parse_statement_manually

router = APIRouter()

class StatementRequest(BaseModel):
    text: str
    brokerageName: str

@router.post("/api/manual/parse-statement")
def parse_statement_manual_endpoint(request: StatementRequest):
    try:
        holdings = parse_statement_manually(request.text, request.brokerageName)
        return holdings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing statement manually: {str(e)}")
